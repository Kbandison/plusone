import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MUTABLE_EVENTS, NOTIFICATION_DEFAULTS } from "@plusone/config";

/**
 * A switch for something that never happens is worse than no switch.
 *
 * This app keeps producing the same failure: a capability built and never
 * joined up. The onboarding quiz that could be skipped and never returned to.
 * /admin, a layout over nothing. `subscriptions.plan`, written and never read.
 * `DROP.hourLocal`, declared and never used. `profiles.timezone`, read in four
 * places and written in none. Every notification path a 404.
 *
 * §8's matrix was the same thing at a larger scale — fifteen templates and, for
 * most of them, no code anywhere that would ever send one. That was survivable
 * while they were unreachable strings in a config file. It stopped being
 * survivable the moment each one became a labelled row on a settings screen,
 * because a control panel is a promise about what the machine does.
 *
 * So this is the test that says every event has a trigger. It is deliberately
 * the loudest one in the file.
 */

const SRC = join(import.meta.dirname, "..");
const MIGRATIONS = join(import.meta.dirname, "../../../../supabase/migrations");

/** Every non-test source file under src, as text. */
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...sources(path));
      continue;
    }
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
    out.push(readFileSync(path, "utf8"));
  }
  return out;
}

const ALL = sources(SRC);

/** The migration that has this text in it, whichever one that is. */
function migration(needle: string): string {
  for (const name of readdirSync(MIGRATIONS).sort().reverse()) {
    const text = readFileSync(join(MIGRATIONS, name), "utf8");
    if (text.includes(needle)) return text;
  }
  throw new Error(`no migration contains ${needle}`);
}

describe("every event has something that fires it", () => {
  /**
   * Matches the two shapes a dispatch actually takes:
   *
   *   notify("connect_received", …)          — the ordinary call site
   *   notifyMember("drop_ready", recipients) — the cron's import alias
   *   tellTheOther(chatId, "plan_confirmed") — a helper that takes the event
   *
   * The optional leading identifier is what covers the third. A bare string
   * anywhere in the file would not count, which is the point: a comment
   * mentioning an event is not a trigger for it.
   */
  const CALL = /\b(?:notify|notifyMember|tellTheOther)\(\s*(?:[A-Za-z0-9_.]+,\s*)?"(\w+)"/g;

  const fired = new Set<string>();
  for (const text of ALL) {
    for (const match of text.matchAll(CALL)) fired.add(match[1]!);
  }

  it("finds the call sites at all", () => {
    expect(fired.size).toBeGreaterThan(5);
  });

  it.each(Object.keys(NOTIFICATION_DEFAULTS).map((e) => [e] as const))(
    "%s is sent from somewhere",
    (event) => {
      expect(
        fired.has(event),
        `${event} has a template, a default and a switch, and nothing in the app sends it`,
      ).toBe(true);
    },
  );

  it("sends nothing the config has not declared", () => {
    for (const event of fired) {
      expect(Object.keys(NOTIFICATION_DEFAULTS), event).toContain(event);
    }
  });
});

describe("the claim is what makes a repeated sweep safe", () => {
  /**
   * The fuse warning learned this expensively: it queried without writing back
   * and the job runs hourly, so a member whose chat closed tomorrow got the
   * same warning twenty-four times. Selecting and stamping in ONE statement is
   * what makes a second run find nothing.
   */
  const CLAIMS = [
    "claim_connect_expiry_warnings",
    "claim_chat_closed_notices",
    "claim_premium_expiry_warnings",
    "claim_nearby_joins",
  ];

  it.each(CLAIMS.map((c) => [c] as const))("%s stamps as it selects", (name) => {
    const sql = migration(`function public.${name}`);
    const body = sql.slice(sql.indexOf(`function public.${name}`));
    const fn = body.slice(0, body.indexOf("$$;") + 3);
    // The stamp lives inside a CTE that also returns the rows, so there is no
    // window between deciding who to tell and recording that they were told.
    expect(fn, name).toMatch(/claimed as \(\s*(?:--[^\n]*\n\s*)*update/);
    expect(fn, name).toMatch(/returning/);
  });

  it("refuses a member outright", () => {
    for (const name of CLAIMS) {
      const sql = migration(`function public.${name}`);
      const body = sql.slice(sql.indexOf(`function public.${name}`));
      expect(body, name).toMatch(new RegExp(`assert_not_end_user\\('${name}'\\)`));
    }
  });
});

describe("what the notifications table lets a member do", () => {
  const sql = migration("create table if not exists public.notifications");

  /**
   * Supabase's default privileges hand every role everything on a NEW object in
   * this schema. This has caught the same mistake eight times.
   */
  it("takes back what Supabase granted, then gives one thing", () => {
    expect(sql).toMatch(/revoke all on public\.notifications from anon, authenticated/);
    expect(sql).toMatch(/grant select on public\.notifications to authenticated/);
  });

  /**
   * A member who could INSERT here could put a notification in anybody's list,
   * and one who could INSERT into the mutes could silence somebody else. Both
   * are written by definer functions on the member's behalf; select is the only
   * grant either table has.
   */
  it("lets nobody write their own", () => {
    for (const table of ["notifications", "notification_mutes"]) {
      const grants = [...sql.matchAll(new RegExp(`grant (\\w+) on public\\.${table} to`, "g"))].map(
        (m) => m[1],
      );
      expect(grants, table).toEqual(["select"]);
    }
  });

  /** The bell would be wrong until the next navigation without it. */
  it("puts the list on the replication stream", () => {
    const pub = migration("supabase_realtime add table public.notifications");
    expect(pub).toMatch(/alter publication supabase_realtime add table public\.notifications/);
  });

  /**
   * A row here is an event and two references and no text at all, so the line
   * is composed from what the READER may see. A stored sentence would freeze
   * the name of somebody since blocked, or the author of an anonymous post.
   */
  it("stores references rather than sentences", () => {
    const table = sql.slice(
      sql.indexOf("create table if not exists public.notifications"),
      sql.indexOf("create index if not exists notifications_unread_ix"),
    );
    expect(table).toMatch(/event text not null/);
    expect(table).not.toMatch(/\bbody\b|\btitle\b|\bmessage\b/);
  });
});

describe("the list marks itself read without changing under the reader", () => {
  const page = readFileSync(join(SRC, "app/app/notifications/page.tsx"), "utf8");

  /**
   * after(), not `void`. A PostgrestBuilder is a thenable — the request is made
   * inside then() — so `void supabase.rpc(...)` builds the call and throws it
   * away. Four read markers in this app sat at nought forever that way.
   */
  it("marks read after the response, not during the render", () => {
    expect(page).toMatch(/after\(async \(\) => \{[\s\S]{0,120}mark_notifications_read/);
    expect(page).not.toMatch(/void supabase\.rpc\("mark_notifications_read"/);
  });

  /** Otherwise this render would show nothing as new — including what just was. */
  it("reads the rows before it marks them", () => {
    expect(page.indexOf("my_notifications")).toBeLessThan(page.indexOf("mark_notifications_read"));
  });

  /**
   * my_notifications resolves the exact destination through the member's own
   * permissions, and returns null for a post since deleted. The event's
   * page-level path is the fallback — never the other way round, because a
   * fallback that wins would make every row point at a list.
   */
  it("prefers the resolved destination and falls back to the event's page", () => {
    expect(page).toMatch(/row\.subject_path \?\? NOTIFICATIONS\[event\]\.path/);
  });
});

describe("the switches", () => {
  const action = readFileSync(join(SRC, "app/app/settings/notifications/actions.ts"), "utf8");

  /**
   * Not a second wall — set_notification_mute reads auth.uid() itself and
   * refuses verification_decided. This stops a malformed call reaching the
   * database, so an event this build does not know about fails as a false
   * rather than as a row nothing will ever read.
   */
  it("refuses an event or a channel the app does not know about", () => {
    expect(action).toMatch(/MUTABLE_EVENTS[\s\S]{0,60}includes\(event\)/);
    expect(action).toMatch(/NOTIFICATION_CHANNELS[\s\S]{0,60}includes\(channel\)/);
  });

  /**
   * Only OFF is stored. Turning something back on DELETES the row rather than
   * writing a true, which is what makes a later change to NOTIFICATION_DEFAULTS
   * reach everybody who never expressed a preference.
   */
  it("stores an absence rather than an on", () => {
    const sql = migration("function public.set_notification_mute");
    const fn = sql.slice(sql.indexOf("function public.set_notification_mute"));
    expect(fn).toMatch(/if p_muted then[\s\S]{0,300}insert into public\.notification_mutes/);
    expect(fn).toMatch(/else[\s\S]{0,200}delete from public\.notification_mutes/);
  });

  it("cannot silence the one a member is waiting on", () => {
    const sql = migration("function public.set_notification_mute");
    expect(sql).toMatch(/p_event = 'verification_decided'[\s\S]{0,120}raise exception/);
    expect(MUTABLE_EVENTS).not.toContain("verification_decided");
  });
});
