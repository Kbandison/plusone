import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const APP = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(APP, p), "utf8");

/**
 * A segment with a layout and no page is a 404 wearing navigation.
 *
 * /admin had exactly that: six sections listed across the top of a layout, and
 * the URL holding them led nowhere. The Settings link I added pointed straight
 * at it. Nothing caught it — the route compiled, the layout compiled, and the
 * only thing missing was the one file that makes a segment a place.
 */
describe("every linked route is somewhere you can arrive", () => {
  /**
   * Walks the app directory for internal hrefs and checks each one resolves to
   * a page. Cheap, and it is the check that would have caught this.
   */
  function pagesUnder(dir: string, prefix = ""): Set<string> {
    const found = new Set<string>();
    for (const entry of readdirSync(join(APP, dir), { withFileTypes: true })) {
      if (entry.name === "page.tsx") found.add(prefix || "/");
      if (!entry.isDirectory()) continue;
      // Route groups and parallel/private segments do not appear in the URL.
      if (entry.name.startsWith("_")) continue;
      const segment = /^[(@]/.test(entry.name) ? "" : `/${entry.name}`;
      for (const nested of pagesUnder(`${dir}/${entry.name}`, `${prefix}${segment}`)) {
        found.add(nested);
      }
    }
    return found;
  }

  const pages = pagesUnder(".");

  it("finds the routes at all", () => {
    // A silent zero would make every assertion below vacuous.
    expect(pages.size).toBeGreaterThan(20);
  });

  it("has a page at /admin, not just a layout over one", () => {
    expect(pages.has("/admin")).toBe(true);
    expect(existsSync(join(APP, "admin/page.tsx"))).toBe(true);
  });

  /** Every section the admin nav lists. */
  it("has a page behind every admin tab", () => {
    const layout = read("admin/layout.tsx");
    const linked = [...layout.matchAll(/href: "(\/admin[^"]*)"/g)].map((m) => m[1]!);
    expect(linked.length).toBeGreaterThan(4);
    for (const href of linked) expect(pages, href).toContain(href);
  });

  /**
   * The link in Settings, which is the only way into /admin from inside the
   * app — and which pointed at a 404 for one commit.
   */
  it("has a page behind the link that gets you there", () => {
    const settings = read("app/settings/page.tsx");
    const href = /href="(\/admin[^"]*)"/.exec(settings)?.[1];
    expect(href).toBeTruthy();
    expect(pages).toContain(href!);
  });
});

/**
 * A count query written separately from the list it counts is a second
 * definition of "open", and the two disagree the first time either changes.
 */
describe("the front door counts what the sections show", () => {
  const home = read("admin/page.tsx");

  it("calls the same RPCs the sections call", () => {
    expect(home).toMatch(/rpc\("admin_open_reports"\)/);
    expect(home).toMatch(/rpc\("admin_flagged_verifications"\)/);
    expect(read("admin/reports/page.tsx")).toMatch(/rpc\("admin_open_reports"\)/);
    expect(read("admin/verifications/page.tsx")).toMatch(/rpc\("admin_flagged_verifications"\)/);
  });

  /** A failed count must not render as a confident zero. */
  it("shows a failure rather than a zero", () => {
    expect(home).toMatch(/queue\.error \?/);
  });
});

/**
 * The roster shows who and when, and nothing that costs a written reason.
 *
 * §7.3 refused a listing because "anything more is a directory of members'
 * private details with a search box on it". Kevin asked for one on 2026-09-09;
 * the objection is answered by what it withholds, so these assertions are the
 * answer and not decoration.
 */
describe("the member roster", () => {
  const roster = readFileSync(join(APP, "admin/members/roster.tsx"), "utf8");
  const migration = readFileSync(
    join(APP, "../../../../supabase/migrations/20260909000600_a_roster_not_a_directory.sql"),
    "utf8",
  );

  it("reads it through an admin-gated definer function", () => {
    expect(roster).toMatch(/rpc\("admin_member_roster"\)/);
    expect(migration).toMatch(/security definer/);
    expect(migration).toMatch(/where public\.is_admin\(\)/);
  });

  it.each([
    "condition",
    "condition_detail",
    "u_equals_u",
    "community",
    "email",
    "phone",
    "location",
    "bio",
    "prompts",
  ])("never returns %s", (column) => {
    // The returns-table block is the contract. A column absent from it cannot
    // reach the screen however the component is written.
    const returns = migration.slice(
      migration.indexOf("returns table ("),
      migration.indexOf("language sql"),
    );
    expect(returns).not.toMatch(new RegExp(`\\b${column}\\b`));
  });

  it("returns the six things it is for, so the negatives above are not vacuous", () => {
    // The floor. Every assertion above passes against an empty string, and this
    // repo has been caught by exactly that more than once.
    const returns = migration.slice(
      migration.indexOf("returns table ("),
      migration.indexOf("language sql"),
    );
    for (const column of [
      "display_name",
      "verification_status",
      "created_at",
      "last_active_at",
      "joined_in_beta",
      "open_reports",
    ]) {
      expect(returns, column).toMatch(new RegExp(`\\b${column}\\b`));
    }
  });

  it("is capped and has no offset, so it is a first screen and not a directory", () => {
    // The BODY, not the file. Two different pieces of prose in this migration
    // argue for having no offset and both contain the word — the leading
    // docblock, and then the `comment on function` string, which survives
    // stripping `--` lines because it is a literal. The negative match failed
    // twice on the very text explaining why it should pass. Prose has no gate,
    // so assert against the code.
    const body = migration.slice(migration.indexOf("as $$"), migration.indexOf("$$;"));
    const sql = body.replace(/^\s*--.*$/gm, "");
    expect(sql).toMatch(/limit 200/);
    expect(sql).not.toMatch(/offset/i);
    expect(sql).not.toMatch(/p_page|p_offset/);
  });

  it("keeps the search that reaches one person", () => {
    const page = readFileSync(join(APP, "admin/members/page.tsx"), "utf8");
    expect(page).toMatch(/<MemberSearch \/>/);
    expect(page).toMatch(/<Roster \/>/);
  });

  it("does not let the table scroll the document sideways", () => {
    // 1ea97be: an overflow at document level shifts the header and the wordmark
    // with it. A wide table belongs in its own scroll container.
    expect(roster).toMatch(/overflow-x-auto/);
    expect(roster).toMatch(/<table/);
  });
});
