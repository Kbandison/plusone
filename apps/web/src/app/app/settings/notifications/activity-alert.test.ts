import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { NEARBY_JOIN_MIN_COUNT, NOTIFICATIONS, NOTIFICATION_DEFAULTS } from "@plusone/config";

const HERE = join(import.meta.dirname);
const read = (p: string) => readFileSync(join(HERE, p), "utf8");

const withoutComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(--|\/\/|\*)/.test(line))
    .join("\n");

const sql = withoutComments(
  read("../../../../../../../supabase/migrations/20260829001000_an_alert_a_member_asked_for.sql"),
);
const route = withoutComments(read("../../../api/cron/activity-nearby/route.ts"));
const action = withoutComments(read("activity-alert-actions.ts"));

/**
 * The premium activity alert (server 18c).
 *
 * Everything pinned here fails SILENTLY if it regresses, which is the only
 * reason any of it is a test rather than a comment. A member is not told when
 * a cooldown stops being enforced, a count reaching a payload looks like a
 * nicer notification, and a table that quietly re-acquires the grants Supabase
 * hands every new table looks like nothing at all.
 */
describe("the activity alert cannot become a nag or a leak", () => {
  it("withholds notified_at from the member's own update grant", () => {
    // The cooldown is what keeps a paid feature from becoming the nightly
    // "come back" §3.3 refuses. A member who could stamp this could clear it.
    const update = /grant update \(([^)]*)\) on public\.activity_alerts/.exec(sql);
    expect(update).not.toBeNull();
    expect(update?.[1]).not.toMatch(/notified_at/);
    expect(update?.[1]).toMatch(/radius_mi/);
    expect(update?.[1]).toMatch(/enabled/);
  });

  it("revokes the grants a new table arrives with, from BOTH roles", () => {
    // 20260826000200 exists because two tables forgot exactly this, and one of
    // them was one plausible policy away from a member writing their own
    // premium entitlement.
    expect(sql).toMatch(/revoke all on public\.activity_alerts from anon, authenticated;/);
  });

  it("keeps the claim function away from end users", () => {
    expect(sql).toMatch(/assert_not_end_user\('claim_activity_alerts'\)/);
    expect(sql).toMatch(
      /revoke all on function public\.claim_activity_alerts\([^)]*\)\s*\n?\s*from public, anon, authenticated;/,
    );
  });

  it("counts only people the member could actually see", () => {
    // A count that included the invisible would be a lie, and a lie that leaks.
    expect(sql).toMatch(/can_view_profile\(/);
  });

  it("checks premium when the alert FIRES, not when it is saved", () => {
    // So a lapsed subscription stops the alert at the next sweep, and a member
    // who comes back still has the radius they chose.
    expect(sql).toMatch(/is_premium\(p\.id\)/);
    expect(action).not.toMatch(/is_premium|i_am_premium/);
  });

  it("shares §8's floor with nearby-joins rather than restating it", () => {
    // Two numbers that agree today are two numbers that can disagree tomorrow.
    expect(route).toMatch(/p_min: NEARBY_JOIN_MIN_COUNT/);
    expect(NEARBY_JOIN_MIN_COUNT).toBe(5);
  });

  it("never puts a number in what the member is told", () => {
    // §8: no count granularity below five. The claim returns a count to decide
    // WHETHER to send; it must not decide what it says.
    expect(NOTIFICATIONS.activity_nearby.body).not.toMatch(/\d/);
    expect(route).not.toMatch(/notify\([^)]*active/);
  });

  it("is in-app by default, so nobody is opted into a push they did not ask for", () => {
    // §3.3 bans the app nudging a member. It does not ban a member asking to
    // be told — but the asking has to be theirs.
    expect(NOTIFICATION_DEFAULTS.activity_nearby).toEqual(["in_app"]);
  });

  it("builds the notifier before consuming the claim", () => {
    // The fuse warning's lesson: a self-consuming claim that stamps rows and
    // then discovers it has nowhere to send them has eaten the notification,
    // and it fails silently.
    expect(route.indexOf("notifier()")).toBeGreaterThan(-1);
    expect(route.indexOf("notifier()")).toBeLessThan(route.indexOf("claim_activity_alerts"));
  });

  it("names the migration when it is not applied yet", () => {
    // Code reaches production before the schema here, as a matter of course.
    // A generic 500 every hour is something people learn to scroll past.
    expect(route).toMatch(/42883/);
    expect(route).toMatch(/20260829001000/);
  });
});
