import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CONNECTS, COPY } from "@plusone/config";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const read = (p: string) => readFileSync(join(HERE, p), "utf8");

/** Comments out, so nothing below is satisfied by prose describing it. */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const row = strip(read("[roomId]/post-row.tsx"));
const page = strip(read("[roomId]/page.tsx"));
const thread = strip(read("[roomId]/thread.tsx"));

const MIGRATIONS = join(HERE, "..", "..", "..", "..", "..", "..", "supabase", "migrations");
const sql = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
  .filter((t) => t.includes("connect_permitted_bulk"))
  .join("\n");

/**
 * The way out of a room, which had no control until 2026-09-16.
 *
 * Everything behind it was already built: connect_permitted carries the rule,
 * connects.source has a 'room' value with a CHECK forcing room_id, the connect
 * panel accepts source=room, and the intercepting modal names a room as one of
 * the three places a connect starts. Nothing rendered a control, so
 * COPY.supportOnly.toggle promised something the app could not do and
 * CONNECTS.supportOnlyPerWeek was a budget for an unreachable action.
 *
 * Kevin found it twice, from two different screens, before it was built.
 */
describe("a room post can be replied to as a person", () => {
  it("finds the files at all", () => {
    // The floor. Stripping a heavily-commented file can leave very little.
    expect(row).toMatch(/export function PostRow/);
    expect(sql.length).toBeGreaterThan(400);
  });

  it("links to the same form the Drop and Browse use", () => {
    // Not a second connect flow. One form, three entrances.
    expect(row).toMatch(/\/app\/connect\/\$\{post\.author_id\}\?source=room&room=\$\{roomId\}/);
  });

  it("carries the room, because the server checks both people are in it", () => {
    // connects.source = 'room' has a CHECK requiring room_id, and
    // connect_permitted needs it to answer the support-only case at all.
    expect(row).toMatch(/room=\$\{roomId\}/);
  });

  it("shows nothing for an anonymous post or an article", () => {
    // Both arrive with a null author. An article additionally has nobody to
    // reach, which is the case the room page already calls out.
    expect(row).toMatch(/canReach && post\.author_id && post\.author_name/);
  });

  it("never decides reachability on the client", () => {
    // The rule is not obvious — a dating member may not initiate toward a
    // support-only one, and a support-only member may only reach a dating
    // member through a room they are BOTH in. A second copy here would be a
    // door the RPC refuses.
    expect(row).not.toMatch(/support_only|profile_mode|is_member_of_room/);
    expect(row).toMatch(/canReach = false/);
  });

  it("shares one wait with the photos rather than adding a round trip", () => {
    // navigation.test.ts caps the room page at two blocking round trips, after
    // a regression that made it three — and it caught this one being added as a
    // fourth. Neither of these can join the batch above them, because both need
    // the feed; they do not need each other.
    for (const src of [page, thread]) {
      expect(src).toMatch(/await Promise\.all\(\[\s*(?:authorPhotos|photos|photosFor)/);
      expect(src).not.toMatch(/await supabase\s*\.rpc\("connect_permitted_bulk"/);
    }
  });

  it("asks once for the whole feed, not once per author", () => {
    // A room page renders a feed. Per-author means a round trip per person on
    // screen, on a page whose load time was worked on this month.
    for (const src of [page, thread]) {
      expect(src).toMatch(/connect_permitted_bulk/);
      expect(src).toMatch(/p_targets: authorIds/);
    }
  });

  it("survives the function not being applied yet", () => {
    // Applied by hand like every migration, and PostgREST fails the WHOLE
    // request on an unknown one — which here would take the room feed and the
    // thread down rather than one control. Empty is the safe answer: no control,
    // which is exactly the state before this existed.
    for (const src of [page, thread]) expect(src).toMatch(/\(\) => \(\{ data: null \}\)/);
  });
});

describe("the filter defers to the rule rather than restating it", () => {
  it("calls connect_permitted instead of reimplementing it", () => {
    // Two copies of "may A reach B" is how a screen starts offering a door the
    // RPC refuses, and the refusal has to win.
    expect(sql).toMatch(/public\.connect_permitted\(t, p_room_id\)/);
    expect(sql).not.toMatch(/profile_mode|v_my_mode/);
  });

  it("runs as the caller", () => {
    // connect_permitted is a definer and reads auth.uid(). A definer wrapper
    // would introduce a second identity and answer for the wrong person.
    expect(sql).toMatch(/security invoker/);
  });

  it("drops nulls and excludes the caller", () => {
    // An anonymous post and an article both arrive with a null author, and
    // asking about nobody is not a question. Offering to reach yourself is a
    // control that does nothing.
    expect(sql).toMatch(/t is not null/);
    expect(sql).toMatch(/t is distinct from \(select auth\.uid\(\)\)/);
  });

  it("is reachable by members and nobody else", () => {
    expect(sql).toMatch(
      /revoke all on function public\.connect_permitted_bulk[^;]*from public, anon/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.connect_permitted_bulk[^;]*to authenticated/,
    );
  });
});

describe("the promise this was built to keep", () => {
  it("is still made in the support-only copy", () => {
    // If this sentence is ever removed, the feature has lost its reason and
    // whoever removed it should have to look at this test.
    expect(COPY.supportOnly.toggle).toMatch(/reach out to people you meet there/);
  });

  it("has a budget that is now spendable", () => {
    // Room-scoped and weekly rather than daily. Before the control existed this
    // was config for an action nobody could take.
    expect(CONNECTS.supportOnlyPerWeek).toBeGreaterThan(0);
  });
});
