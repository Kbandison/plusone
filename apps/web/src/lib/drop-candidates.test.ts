import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DROP, RADIUS } from "@plusone/config";
import { drop as dropLogic } from "@plusone/logic";

import { DROP_REACH_MI, wouldHaveDrop, type CandidateRow } from "./drop-candidates";

/**
 * "Tonight's Drop is ready" fired onto empty Drops — twice.
 *
 * The first time (2026-09-21) nothing checked. The second (2026-10-06) the
 * check asked drop_candidates whether it returned any row, and drop_candidates
 * returns already-connected, last-active and last-served as COLUMNS for
 * isEligible to filter. Two of seven real members were told on 5 October that
 * their Drop had landed, with nobody in it.
 *
 * So the question is now asked of selectDrop, and these pin each of the three
 * things the SQL check could not see.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-06T21:00:00.000Z");
const CONFIG = dropLogic.DEFAULT_DROP_CONFIG;
const VIEWER = { intention: "long_term", radiusMi: 50 };

const row = (over: Partial<CandidateRow> = {}): CandidateRow => ({
  id: over.id ?? "11111111-1111-4111-8111-111111111111",
  intention: "long_term",
  last_active_at: new Date(NOW - DAY).toISOString(),
  distance_mi: 10,
  times_served: 0,
  already_connected: false,
  last_served_to_viewer_at: null,
  ...over,
});

describe("wouldHaveDrop asks the Drop, not the walls", () => {
  it("says yes when somebody is eligible", () => {
    expect(wouldHaveDrop(VIEWER, [row()], NOW, CONFIG)).toBe(true);
  });

  it("says no to nobody at all", () => {
    expect(wouldHaveDrop(VIEWER, [], NOW, CONFIG)).toBe(false);
  });

  it("says no when everybody in reach is already a connect", () => {
    const rows = [
      row({ id: "a", already_connected: true }),
      row({ id: "b", already_connected: true }),
    ];
    expect(wouldHaveDrop(VIEWER, rows, NOW, CONFIG)).toBe(false);
  });

  it("says no when everybody was shown inside the suppression window", () => {
    const served = new Date(NOW - (DROP.suppressRecentlyServedDays - 1) * DAY).toISOString();
    expect(wouldHaveDrop(VIEWER, [row({ last_served_to_viewer_at: served })], NOW, CONFIG)).toBe(
      false,
    );
  });

  it("says yes again once the suppression window has passed", () => {
    const served = new Date(NOW - (DROP.suppressRecentlyServedDays + 1) * DAY).toISOString();
    expect(wouldHaveDrop(VIEWER, [row({ last_served_to_viewer_at: served })], NOW, CONFIG)).toBe(
      true,
    );
  });

  it("says no when everybody has gone quiet", () => {
    const stale = new Date(NOW - (DROP.activeWithinDays + 2) * DAY).toISOString();
    expect(wouldHaveDrop(VIEWER, [row({ last_active_at: stale })], NOW, CONFIG)).toBe(false);
  });

  /** The ladder climbs for an empty area, so this must too. */
  it("counts somebody past the member's own radius but inside the ladder", () => {
    expect(wouldHaveDrop(VIEWER, [row({ distance_mi: DROP_REACH_MI - 1 })], NOW, CONFIG)).toBe(
      true,
    );
  });

  it("does not count somebody past the ladder's top rung", () => {
    expect(wouldHaveDrop(VIEWER, [row({ distance_mi: DROP_REACH_MI + 1 })], NOW, CONFIG)).toBe(
      false,
    );
  });

  /** The exact shape that fired on 5 October: rows exist, none of them showable. */
  it("is not fooled by a pool that only looks full", () => {
    const served = new Date(NOW - 3 * DAY).toISOString();
    const rows = [
      row({ id: "a", already_connected: true }),
      row({ id: "b", last_served_to_viewer_at: served }),
      row({ id: "c", last_served_to_viewer_at: served }),
    ];
    expect(rows.length).toBeGreaterThan(0);
    expect(wouldHaveDrop(VIEWER, rows, NOW, CONFIG)).toBe(false);
  });
});

describe("the Drop and its notification look the same distance", () => {
  it("reaches the ladder's top rung", () => {
    expect(DROP_REACH_MI).toBe(RADIUS.ladderMi[RADIUS.ladderMi.length - 1]);
    // Not maxMi: that is how far a member may CHOOSE, and the ladder exists to
    // look further on behalf of somebody whose area is empty.
    expect(DROP_REACH_MI).toBeGreaterThanOrEqual(RADIUS.maxMi);
  });

  const withoutComments = (source: string) =>
    source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !/^\s*(--|\/\/|\*)/.test(line))
      .join("\n");
  const drop = withoutComments(readFileSync(join(import.meta.dirname, "drop.ts"), "utf8"));
  const cron = withoutComments(
    readFileSync(join(import.meta.dirname, "../app/api/cron/drop-notify/route.ts"), "utf8"),
  );

  /**
   * a90f617 raised the ladder to 350 and the Drop kept fetching at maxMi — so
   * the last rung climbed over a pool that stopped at 250, and the cron, which
   * looked out to 350, announced people the Drop could not show.
   */
  it("fetches the Drop out to that reach", () => {
    expect(drop).toMatch(/p_max_radius_mi: DROP_REACH_MI/);
    expect(drop).not.toMatch(/p_max_radius_mi: RADIUS\.maxMi/);
  });

  it("asks the cron's question at that reach too", () => {
    const asked = cron.match(/p_radius_mi: (\w+)/g) ?? [];
    expect(asked.length).toBeGreaterThan(0);
    for (const line of asked) expect(line).toBe("p_radius_mi: DROP_REACH_MI");
  });

  it("builds candidates for both through one mapping", () => {
    expect(drop).toMatch(/toDropCandidates\(candidateRows, vectors\)/);
    expect(drop).not.toMatch(/alreadyConnected: row\.already_connected/);
  });
});
