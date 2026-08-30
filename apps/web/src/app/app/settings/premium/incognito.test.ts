import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const MIGRATIONS = new URL("../../../../../../../supabase/migrations/", import.meta.url);
const sql = readdirSync(fileURLToPath(MIGRATIONS))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(fileURLToPath(new URL(f, MIGRATIONS)), "utf8"))
  .join("\n");

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

/**
 * SQL with the prose stripped.
 *
 * The grant assertions below caught the comment in 20260829000400 that SAYS
 * "No `grant update (incognito)` anywhere, deliberately" — a test that reads a
 * migration's explanation of itself is a test that can be satisfied by writing
 * the right sentence, which is the exact opposite of what it is for.
 */
const code = sql.replace(/--[^\n]*/g, "");

/**
 * Incognito (server 18a), and the properties that must not be refactored away.
 *
 * These are pinned rather than commented because each one fails SILENTLY and in
 * the direction that exposes somebody. A member goes incognito because they do
 * not want to be seen; every bug here ends with them being seen anyway, and
 * none of them produces an error anybody would notice.
 */
describe("a lapse never makes a member more visible", () => {
  /**
   * The rule the whole feature turns on. If premium ending un-hid somebody, the
   * app would put a person who is ill back into a directory they had paid to be
   * absent from, at a moment they were not present and had not agreed to
   * anything.
   *
   * macOS reached the same asymmetry independently for per-photo privacy —
   * overrides retained forever, premium gating only the setting of them.
   */
  it("gates only the ON direction", () => {
    const fn =
      /create or replace function public\.set_incognito[\s\S]*?\$\$;/.exec(code)?.[0] ?? "";
    expect(fn.length).toBeGreaterThan(0);
    // `p_on and not is_premium` — the premium test is reachable only when
    // turning it on. A bare `not is_premium` would trap a lapsed member hidden.
    expect(fn).toMatch(/if\s+p_on\s+and\s+not\s+public\.is_premium/);
    expect(fn).not.toMatch(/if\s+not\s+public\.is_premium\s*\(/);
  });

  /** Nothing clears the column on expiry — no sweep, no cron, no trigger. */
  it("has nothing anywhere that resets incognito when premium ends", () => {
    for (const match of code.matchAll(/set\s+incognito\s*=\s*([a-z_.()]+)/g)) {
      // The only writer sets it to the argument it was given.
      expect(match[1], "something writes incognito besides set_incognito()").toBe("p_on");
    }
  });

  /** The button has to keep working, or the exit is what is being sold. */
  it("offers turning it off whatever the premium state", () => {
    const toggle = read("./incognito-toggle.tsx");
    // Disabled only in the OFF -> ON direction.
    expect(toggle).toMatch(/disabled=\{pending \|\| \(!current && !canTurnOn\)\}/);
    expect(toggle).not.toMatch(/disabled=\{pending \|\| !isPremium\}/);
  });
});

/**
 * The two lapse rules point in opposite directions, and the comments now say
 * so. This pins the pair, because a comment explaining why two things differ is
 * only as durable as the next person's willingness to read it.
 */
describe("the two lapse rules stay opposite, and each says so", () => {
  it("keeps incognito on a lapse and drops a filter on one", () => {
    const fn =
      /create or replace function public\.set_incognito[\s\S]*?\$\$;/.exec(code)?.[0] ?? "";
    // Incognito: the premium test is reachable only in the ON direction, so a
    // lapsed member stays hidden.
    expect(fn).toMatch(/if\s+p_on\s+and\s+not\s+public\.is_premium/);

    // Filters: the paid ones are skipped entirely for a non-premium member.
    const filters = read("../../browse/filter-state.ts");
    expect(filters).toMatch(/if \(!isPremium && isPaidGroup\(filter\.group\)\) continue;/);
  });

  /**
   * Applying either rule to the other gives the wrong answer, and one of the
   * two wrong answers un-hides a member who is ill. Both sites have to carry
   * the cross-reference, or whichever one is read first is believed.
   */
  it("names the other case at both sites", () => {
    const migration =
      /-- Incognito browse \(backlog server 18a\)[\s\S]*?alter table public\.profiles/.exec(
        sql,
      )?.[0] ?? "";
    expect(migration).toMatch(/opposite action from the lapse rule on the browse filters/i);
    expect(read("../../browse/filter-state.ts")).toMatch(/prescribe OPPOSITE actions/);
  });
});

describe("the gate is the missing grant, not the action", () => {
  /**
   * `profiles` has no whole-table grant, so withholding the column grant leaves
   * a member no path to it at all — stronger than a path that is checked.
   * 18b needed a trigger instead because `profile_photos` DOES carry a
   * whole-table update grant; the right gate is a consequence of how the table
   * was granted, and this schema does both.
   */
  it("never grants update on the column", () => {
    expect(code).toMatch(/add column if not exists incognito boolean/);
    expect(code).not.toMatch(/grant update \([^)]*incognito/);
    expect(code).not.toMatch(/grant insert \([^)]*incognito/);
  });

  /** So deleting the premium logic from the action would change nothing. */
  it("writes only through the definer function", () => {
    const actions = read("./incognito-actions.ts");
    expect(actions).toMatch(/rpc\("set_incognito"/);
    expect(actions).not.toMatch(/from\("profiles"\)[\s\S]{0,80}\.update\(/);
  });

  it("checks premium inside the database rather than only in the action", () => {
    const fn =
      /create or replace function public\.set_incognito[\s\S]*?\$\$;/.exec(code)?.[0] ?? "";
    expect(fn).toMatch(/security definer/);
    expect(fn).toMatch(/public\.is_premium/);
  });
});

describe("who can still see an incognito member", () => {
  const fn = /create or replace function public\.sees_incognito[\s\S]*?\$\$;/.exec(code)?.[0] ?? "";

  it("exists and runs as definer, since connects is own-rows-only", () => {
    expect(fn.length).toBeGreaterThan(0);
    expect(fn).toMatch(/security definer/);
  });

  /**
   * A member who sends a connect while incognito would otherwise arrive in
   * somebody's inbox as an unanswerable request from a profile that cannot be
   * opened. Visibility follows the incognito member's own choices.
   */
  it("keeps them visible to anyone they reached out to, at any status", () => {
    expect(fn).toMatch(/c\.initiator_id = p_target and c\.target_id = \(select auth\.uid\(\)\)/);
  });

  /** The case the feature exists for: an unaccepted request TO them. */
  it("does not expose them to somebody who merely asked", () => {
    const inbound = /c\.initiator_id = \(select auth\.uid\(\)\) and c\.target_id = p_target/.exec(
      fn,
    );
    // The only clause naming that direction is the accepted-status one.
    expect(inbound).not.toBeNull();
    const before = fn.slice(0, fn.indexOf(inbound![0]));
    expect(before).toMatch(/c\.status = 'accepted'/);
  });
});

describe("the wall stays where it was", () => {
  /**
   * PREMIUM_NEVER forbids bypassing the community wall or the support-only
   * shield, and `can_view_profile` is what enforces both. A premium feature
   * folded into that function would put paid logic inside the walls; incognito
   * sits after it in the view instead, and only ever REMOVES rows.
   */
  it("filters in the view, after the wall, rather than inside it", () => {
    // The newest definition, since the view is rebuilt by several migrations.
    const latest = code.slice(code.lastIndexOf("create view public.visible_profiles"));
    const view = /create view public\.visible_profiles[\s\S]*?;\n/.exec(latest)?.[0] ?? "";
    expect(view).toMatch(/and \(not p\.incognito or public\.sees_incognito\(p\.id\)\)/);
    // Compared inside the WHERE alone — the column is also PROJECTED, and the
    // projection comes first, so comparing over the whole view measures the
    // select list rather than the predicate order.
    const where = view.slice(view.lastIndexOf("  where p.id <>"));
    expect(where).toContain("i_can_view");
    expect(where.indexOf("i_can_view")).toBeLessThan(where.indexOf("p.incognito"));
  });

  it("keeps incognito out of the wall functions entirely", () => {
    const wall = /create or replace function public\.can_view_profile[\s\S]*?\$\$;/.exec(code)?.[0];
    expect(wall).toBeDefined();
    expect(wall).not.toMatch(/incognito/);
  });
});
