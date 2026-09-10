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
  // 000700, not 000600. That file created the roster; this one REPLACED it to
  // carry masked contact details, so it is where the contract now lives. A test
  // pinned to the creating migration would keep passing while the live
  // definition drifted away from it — which is this repo's whole argument for
  // reading the artifact rather than the file that once described it.
  const migration = readFileSync(
    join(APP, "../../../../supabase/migrations/20260909000700_enough_to_tell_them_apart.sql"),
    "utf8",
  );

  it("reads it through an admin-gated definer function", () => {
    expect(roster).toMatch(/rpc\("admin_member_roster"\)/);
    expect(migration).toMatch(/security definer/);
    expect(migration).toMatch(/where public\.is_admin\(\)/);
  });

  // email and phone left this list on 2026-09-09: Kevin needed them to place an
  // account whose display name meant nothing to him, which is the roster's own
  // job. They come back MASKED — see the block below, which is the assertion
  // that keeps this from being a quiet widening.
  it.each([
    "condition",
    "condition_detail",
    "u_equals_u",
    "community",
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
      "email_masked",
      "phone_masked",
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

/**
 * Contact details, masked in the list and whole one at a time.
 *
 * The §7.3 objection was about "private details" on screen by default. An admin
 * screen gets photographed — six real waitlist addresses were captured off
 * /admin/waitlist in the session that built this — so the masking is about what
 * is visible without anyone asking, not about access, which is_admin() already
 * decides.
 */
describe("the roster masks contact details", () => {
  const migration = readFileSync(
    join(APP, "../../../../supabase/migrations/20260909000700_enough_to_tell_them_apart.sql"),
    "utf8",
  );
  const body = (fn: string) => {
    // `create function` OR `create or replace function`. admin_member_roster is
    // dropped and recreated here rather than replaced — a return type cannot be
    // changed in place — so an anchor on "or replace" stopped finding it, and
    // the three assertions using this went red on a migration that was correct.
    const at = migration.search(
      new RegExp(String.raw`create (or replace )?function public\.${fn}`),
    );
    expect(at, fn).toBeGreaterThan(-1);
    const open = migration.indexOf("as $$", at);
    return migration.slice(open, migration.indexOf("$$;", open));
  };

  it("masks in SQL, not in the component", () => {
    // A page that ships whole addresses and hides them with CSS has already put
    // them in the payload, where §9.6 wants opaque ids.
    const roster = body("admin_member_roster");
    expect(roster).toMatch(/left\(split_part\(u\.email, '@', 1\), 2\)/);
    expect(roster).toMatch(/right\(u\.phone, 4\)/);
  });

  it("never selects a whole address in the roster", () => {
    // Remove the masking expressions, then look for what is left. The first
    // version of this asserted `u.email` was absent and failed on the mask
    // itself, which of course mentions the column it masks — a negative match
    // over an expression that legitimately names its input cannot work.
    const stripped = body("admin_member_roster")
      .replace(/left\(split_part\(u\.email, '@', 1\), 2\)/g, "")
      .replace(/split_part\(u\.email, '@', 2\)/g, "")
      .replace(/right\(u\.phone, 4\)/g, "")
      // The null-guards name the column without emitting it.
      .replace(/u\.(email|phone) is null/g, "");
    expect(stripped).not.toMatch(/u\.email/);
    expect(stripped).not.toMatch(/u\.phone/);
  });

  it("reveals by id, so it cannot sweep the table", () => {
    const contact = body("admin_member_contact");
    expect(contact).toMatch(/u\.id = p_user_id/);
    expect(contact).toMatch(/limit 1/);
    expect(migration).toMatch(/admin_member_contact\(p_user_id uuid\)/);
  });

  it("is admin-gated on both halves", () => {
    expect(body("admin_member_roster")).toMatch(/where public\.is_admin\(\)/);
    expect(body("admin_member_contact")).toMatch(/where public\.is_admin\(\)/);
    expect(migration).not.toMatch(
      /grant execute on function public\.admin_member_contact\(uuid\) to anon/,
    );
  });

  it("drops the roster before recreating it, because the return type changed", () => {
    // `create or replace` CANNOT change a function's return type, and this adds
    // two columns to the returns-table. Postgres refuses at execution and the
    // whole migration rolls back — but `check:sql` passes it, because the
    // statement is legal grammar and only running it knows. The dry run found
    // it; this stops the drop being tidied away later as boilerplate.
    const drop = migration.indexOf("drop function if exists public.admin_member_roster()");
    const create = migration.search(/create (or replace )?function public\.admin_member_roster/);
    expect(drop).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(drop);
    expect(migration).not.toMatch(/create or replace function public\.admin_member_roster/);
  });

  it("does not describe itself as having no contact details", () => {
    // It said exactly that for one deploy. The column landed and the sentence
    // above it did not, because that one string replacement was the only edit in
    // the batch without an assert on it — a silent no-op, reported to nobody.
    // So the screen showed contact details under a line promising none.
    const roster = readFileSync(join(APP, "admin/members/roster.tsx"), "utf8");
    expect(roster).toMatch(/<ShowContact/);
    expect(roster).not.toMatch(/no\s+contact\s+details/i);
    // And the copy has to say what it IS, not merely not say the wrong thing —
    // otherwise deleting the sentence passes this.
    expect(roster).toMatch(/[Cc]ontact details are masked/);
  });

  it("costs no written reason, unlike a diagnosis", () => {
    // Deliberate. Pricing a phone number like a condition would either cheapen
    // that gate or make ordinary administration tedious enough to route around.
    const contact = body("admin_member_contact");
    expect(contact).not.toMatch(/reason/i);
    expect(readFileSync(join(APP, "admin/members/show-contact.tsx"), "utf8")).not.toMatch(
      /name="reason"/,
    );
  });

  it("still refuses the condition through this door", () => {
    // The floor for the block: if admin_member_contact ever grew a third column
    // this is what notices.
    const contact = body("admin_member_contact");
    expect(migration).toMatch(/returns table \(email text, phone text\)/);
    for (const column of ["condition", "u_equals_u", "community", "bio"]) {
      expect(contact, column).not.toMatch(new RegExp(`\\b${column}\\b`));
    }
  });
});
