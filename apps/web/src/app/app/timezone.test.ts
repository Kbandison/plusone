import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const APP = join(import.meta.dirname);
const read = (p: string) => readFileSync(join(APP, p), "utf8");

const withoutComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(--|\/\/|\*)/.test(line))
    .join("\n");

const client = withoutComments(read("timezone.tsx"));
const action = withoutComments(read("timezone-actions.ts"));
const layout = withoutComments(read("layout.tsx"));
const sql = read("../../../../../supabase/migrations/20260821000500_nobody_has_a_timezone.sql");

/**
 * profiles.timezone was read in four places and written in none.
 *
 * Every row in the database was 'UTC' — the column default — so every timestamp
 * in a chat, a room and the inbox was rendered in the wrong zone, and the drop
 * landed at 20:00 UTC for everybody: four in the afternoon in New York, five in
 * the morning in Sydney. Making the hour real and building a sweep to announce
 * it were both nominal until this.
 */
describe("a member's own timezone is actually recorded", () => {
  it("is reported from the browser, which is the only thing that knows", () => {
    expect(client).toMatch(/Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
    expect(layout).toMatch(/<Timezone current=/);
  });

  /**
   * An IP lookup guesses, and guesses wrongly for anyone on a VPN — which, on
   * an app for people with a diagnosis they may not be public about, is not a
   * small population.
   */
  it("does not infer it from the request", () => {
    expect(action).not.toMatch(/x-vercel-ip|headers\(\)/);
    expect(client).not.toMatch(/fetch\(/);
  });

  /** A member who moves or travels stops getting their evening at the wrong hour. */
  it("reports on every load, not once at signup", () => {
    expect(client).toMatch(/useEffect\(/);
    expect(client).toMatch(/\}, \[current\]\)/);
  });

  /** The common case — nothing changed — must not touch the network at all. */
  it("says nothing when the stored value already matches", () => {
    expect(client).toMatch(/if \(!zone \|\| zone === current\) return;/);
    // And the write is skipped server-side too, on the row every wall reads.
    expect(sql).toMatch(/and timezone is distinct from p_timezone/);
  });

  /**
   * The value is free text from a browser, and local_now falls back rather than
   * raising — so a spoofed zone would silently put a member back on UTC while
   * the row claimed otherwise, which is worse than an error.
   */
  it("validates against Postgres's own list rather than a regex", () => {
    expect(sql).toMatch(/not exists \(select 1 from pg_timezone_names where name = p_timezone\)/);
    expect(sql).toMatch(/raise exception 'not a timezone'/);
  });

  /** Nothing a member could act on, so nothing is shown to them. */
  it("fails quietly", () => {
    expect(action).toMatch(/console\.error/);
    expect(action).not.toMatch(/redirect\(|return \{ error/);
  });

  it("is callable by a member and nobody else", () => {
    expect(sql).toMatch(/revoke all on function public\.set_my_timezone\(text\) from public, anon/);
    expect(sql).toMatch(
      /grant execute on function public\.set_my_timezone\(text\) to authenticated/,
    );
  });
});
