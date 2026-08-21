import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** Assertions read code, not the prose around it. */
const withoutComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

const tonight = withoutComments(read("./page.tsx"));
const card = withoutComments(read("./drop-card.tsx"));
const layout = withoutComments(read("./layout.tsx"));
const panel = withoutComments(read("./connect/[id]/connect-panel.tsx"));
const connectPage = withoutComments(read("./connect/[id]/page.tsx"));

/**
 * Replying to a prompt is a thing you do ABOUT a card, not instead of it.
 * Leaving the grid to write two sentences and coming back to the top of it was
 * the whole reason this became a sheet.
 */
describe("connecting happens over the screen you were on", () => {
  it("intercepts the route from anywhere under /app", () => {
    expect(existsSync(here("./@modal/(.)connect/[id]/page.tsx"))).toBe(true);
    const modal = read("./@modal/(.)connect/[id]/page.tsx");
    expect(modal).toMatch(/<RouteModal>/);
    expect(modal).toMatch(/<ConnectPanel/);
  });

  /**
   * A slot with no default renders a 404 when it cannot match the URL — so
   * without this, every hard load of every screen under /app would fail.
   */
  it("renders nothing the rest of the time", () => {
    expect(existsSync(here("./@modal/default.tsx"))).toBe(true);
    expect(read("./@modal/default.tsx")).toMatch(/return null/);
    expect(layout).toMatch(/modal,/);
    expect(layout).toMatch(/\{modal\}/);
  });

  /**
   * Two copies of a screen that decides who can reach whom is two places for
   * that rule to drift.
   */
  it("is one panel, rendered twice", () => {
    expect(connectPage).toMatch(/<ConnectPanel id=\{id\} source=\{source\} room=\{room\} \/>/);
    expect(panel).toMatch(/from\("visible_profiles"\)/);
    expect(panel).toMatch(/if \(!target\) notFound\(\)/);
    // The wall lives in the panel, so neither entrance can skip it.
    expect(connectPage).not.toMatch(/visible_profiles/);
  });

  /** A hard load still gets the full page, and the URL stays real either way. */
  it("keeps the page for a shared link or a refresh", () => {
    expect(connectPage).toMatch(/<main id="main">/);
    expect(connectPage).toMatch(/export const metadata/);
  });
});

/**
 * There is no "you already connected" state on a drop card, and there must not
 * be one: nothing could ever render it.
 *
 * I added one anyway, on the strength of a note saying already_connected was
 * computed and unused. It had been fixed since. Both paths remove those members
 * before a card exists — isEligible refuses an alreadyConnected candidate when
 * a drop is built, and withoutConnected strips them when one is replayed — so
 * the branch was unreachable the moment it was written. Dead code that looks
 * like a feature is worse than no feature: the next person reads it as proof
 * the case is handled.
 */
describe("a card for somebody you are talking to cannot reach the screen", () => {
  it("is removed when the drop is built", () => {
    const logic = read("../../../../../packages/logic/src/drop/drop.ts");
    expect(logic).toMatch(/if \(candidate\.alreadyConnected\) return false;/);
  });

  it("is removed when the drop is replayed", () => {
    const lib = read("../../lib/drop.ts");
    expect(lib).toMatch(/withoutConnected\(userId, existing\.served_profile_ids as string\[\]\)/);
  });

  it("carries no branch for a case that cannot happen", () => {
    expect(card).not.toMatch(/history/);
    expect(tonight).not.toMatch(/historyWith|HISTORY_LABEL/);
  });
});

/**
 * DROP.hourLocal has declared 20:00 since Milestone 1 and nothing read it. A
 * drop was keyed on the member's local CALENDAR date, so it arrived whenever
 * they first opened the app that day — "three a night" was three a day.
 */
describe("a drop lands at the hour it says it does", () => {
  it("keys the drop on the night rather than the date", () => {
    const lib = read("../../lib/drop.ts");
    expect(lib).toMatch(
      /dropLogic\.dropNightDate\(now, profile\?\.timezone \?\? "UTC", DROP\.hourLocal\)/,
    );
    // The old spelling, which ignored the hour entirely.
    expect(lib).not.toMatch(/function localDate/);
  });

  /** The rhythm is the product — it is why there is no infinite feed here. */
  it("says when the next three land", () => {
    expect(tonight).toMatch(/dropLogic\.nextDropIsToday\(/);
    expect(tonight).toMatch(/DRAFT_COPY\.app\.dropNextTonight\(dropClock\)/);
    expect(tonight).toMatch(/DRAFT_COPY\.app\.dropNextTomorrow\(dropClock\)/);
    expect(tonight).toMatch(/dropLogic\.clockLabel\(DROP\.hourLocal\)/);
  });

  /**
   * record_drop allowed a day either side of UTC today, which was exactly
   * enough when the key could only differ by a timezone offset. A night key can
   * differ by the offset AND the shift back across the hour — a member at
   * UTC-11 at 19:00 local is two days behind UTC. The insert would have raised,
   * no row would have been stored, and a stored row is what makes a drop
   * stable: every page load would have built them a different three.
   */
  it("lets the database accept a night key two days behind UTC", () => {
    const sql = read("../../../../../supabase/migrations/20260821000200_a_night_not_a_day.sql");
    expect(sql).toMatch(/p_drop_date < v_today - 2/);
    expect(sql).not.toMatch(/p_drop_date < v_today - 1/);
    // The forged-drop wall is unchanged, and must stay.
    expect(sql).toMatch(/a drop card must be someone you can see/);
  });

  /** The empty state is the other place a member wants to know when to return. */
  it("says it on an empty night too", () => {
    const empty = tonight.slice(tonight.indexOf("COPY.drop.thin"));
    expect(empty.slice(0, 400)).toMatch(/dropNextTonight|dropNextTomorrow/);
  });
});

/**
 * "Drop-card connects cost nothing — this nudges toward curation" has been true
 * in the trigger since Milestone 1 and stated nowhere a member could read it. A
 * mechanic that only works if people know about it, that nobody was told about,
 * is a mechanic that does not work.
 */
describe("Decision #15 is said out loud", () => {
  it("says a reply here is free", () => {
    expect(tonight).toMatch(/DRAFT_COPY\.app\.dropConnectsFree/);
  });

  it("says what is left for everywhere else", () => {
    expect(tonight).toMatch(/DRAFT_COPY\.app\.dropBudgetLeft\(left, perDay\)/);
    expect(tonight).toMatch(/DRAFT_COPY\.app\.dropBudgetNone/);
    expect(tonight).toMatch(/isPremium \? CONNECTS\.premiumPerDay : CONNECTS\.freePerDay/);
  });

  /** The trigger writes `day` as the database's current_date; this matches it. */
  it("asks about the same day the budget is written against", () => {
    expect(tonight).toMatch(/\.eq\("day", new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\)/);
  });

  /**
   * A support-only member cannot send a connect at all, so a budget is a number
   * about something they cannot do.
   */
  it("shows none of it on a preview", () => {
    expect(tonight).toMatch(/drop\.preview\s*\n?\s*\?\s*\[\{ data: null \}/);
  });
});
