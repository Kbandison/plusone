import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const page = read("./page.tsx");
const section = read("../collapsible-section.tsx");
const browse = read("../browse/page.tsx");
const migration = read(
  "../../../../../../supabase/migrations/20260819000200_a_no_is_allowed_to_last.sql",
);

/**
 * One flat list made a live conversation and an unanswered ask the same object,
 * told apart by a three-word state label most people never read. One you can
 * walk into; the other you can only wait on.
 */
describe("the inbox says what kind of thing each row is", () => {
  it("groups through the logic rather than re-deriving the states", () => {
    expect(page).toMatch(/inboxLogic\.groupThreads\(threads\)/);
    expect(page).not.toMatch(/threads\.filter\(\(t\) => t\.state/);
  });

  it("gives conversations and sent connects their own headings", () => {
    expect(page).toMatch(/C\.inboxChatsHeading/);
    expect(page).toMatch(/heading=\{C\.threadSentWaiting\}/);
  });

  /**
   * "Sent" described how the row got there. "Waiting on them" describes what it
   * is doing, which is what the row already says — and reusing the string means
   * one fact with one spelling rather than two to keep true.
   */
  it("names the sent section for what it is doing", () => {
    expect(page).not.toMatch(/inboxSentHeading/);
  });

  /** One shape for all three, rather than a section that is special. */
  it("folds every section behind a count", () => {
    expect(page.match(/<CollapsibleSection heading=/g)).toHaveLength(3);
    expect(section).toMatch(/tabular-nums/);
  });

  it("puts conversations above the ones you cannot act on", () => {
    expect(page.indexOf("C.inboxChatsHeading")).toBeLessThan(
      page.indexOf("heading={C.threadSentWaiting}"),
    );
  });

  /**
   * One definition of the heading, so all three are the same size by
   * construction rather than by three literals agreeing with each other.
   */
  it("sizes the heading in one place", () => {
    expect(section).toMatch(/text-\[20px\] text-ink/);
    expect(page).not.toMatch(/<h2 className=/);
  });

  /** The count must not read as part of the title. */
  it("keeps the count smaller than the heading", () => {
    expect(section).toMatch(/text-\[13px\] whitespace-nowrap text-ink-3 tabular-nums/);
  });

  /**
   * Conversations folds like the others — one shape, not a special case — but
   * arrives open. Nobody should press anything to see the conversations they
   * are in.
   */
  it("opens conversations on arrival and nothing else", () => {
    expect(page).toMatch(/heading=\{C\.inboxChatsHeading\} count=\{live\.length\} defaultOpen/);
    expect(page.match(/defaultOpen/g)).toHaveLength(1);
    expect(section).toMatch(/defaultOpen = false/);
  });
});

describe("endings fold away", () => {
  it("collapses them behind a count", () => {
    expect(page).toMatch(/heading=\{C\.inboxClosedHeading\} count=\{settled\.length\}/);
    expect(section).toMatch(/aria-expanded=\{open\}/);
  });

  /** §6.2 — an ending is a thing you can go back and look at. */
  it("keeps them reachable rather than dropping them", () => {
    expect(page).toMatch(/settled\.map\(\(thread\) => \(/);
  });

  it("sits under a real heading, not a bare button", () => {
    expect(section).toMatch(/<h2>\s*<button/);
  });
});

/**
 * connect_permitted checked blocks and modes and never looked at history, and
 * connects_one_pending_ix only stops two SIMULTANEOUS asks — so somebody could
 * be asked, decline, and be asked again the same minute, indefinitely.
 */
describe("a decline lasts", () => {
  it("refuses a fresh ask inside the cooldown", () => {
    expect(migration).toMatch(/c\.status = 'declined'/);
    expect(migration).toMatch(/config_int\('cooldowns\.decline_days', 30\)/);
  });

  /** Being declined must not stop the person who declined from asking back. */
  it("only looks at the caller's own asks, in one direction", () => {
    const check = migration.slice(migration.indexOf("if v_cooldown > 0 and exists"));
    expect(check.slice(0, check.indexOf("then"))).toMatch(/c\.initiator_id = v_me/);
    expect(check.slice(0, check.indexOf("then"))).toMatch(/c\.target_id = p_target_id/);
  });

  /**
   * The signature must not change. `create or replace` matches on the argument
   * list, so a third parameter would have made an OVERLOAD beside the old
   * function — and the RLS policy's two-argument call would have gone on
   * reaching the version with no cooldown in it, silently.
   */
  it("keeps the two-argument signature the RLS policy calls", () => {
    expect(migration).toMatch(
      /create or replace function public\.connect_permitted\(\s*p_target_id uuid,\s*p_room_id uuid default null\s*\)/,
    );
    expect(migration).not.toMatch(/p_decline_cooldown_days/);
  });

  it("is tunable from the config editor like every other threshold", () => {
    expect(migration).toMatch(/insert into public\.app_config[\s\S]*cooldowns\.decline_days/);
  });

  /** Not "declined", and not a softened "connected before" either. */
  it("shows nothing at all on a Browse card", () => {
    expect(browse).not.toMatch(/declined/);
  });
});

/**
 * close_chats_on_block left closure_template null, and closed_without_a_note
 * counts exactly that — the metric whose own comment reads "if it is ever
 * non-zero, the product's central promise has broken". It would have gone
 * non-zero on the first block ever placed, as a false alarm: the member IS
 * shown a note, the page renders `closure_template ?? 0`.
 */
describe("a block stops breaking the promise metric", () => {
  it("stores the default note it was already displaying", () => {
    const fn = migration.slice(migration.indexOf("update public.chats c"));
    expect(fn.slice(0, fn.indexOf("from public.connects"))).toMatch(/closure_template = 0/);
  });

  /** The original argument was against making the blocker WRITE one. It stands. */
  it("still asks nothing of the blocker", () => {
    const fn = migration.slice(migration.indexOf("update public.chats c"));
    const body = fn.slice(0, fn.indexOf("from public.connects"));
    expect(body).toMatch(/closure_personal_line = null/);
    expect(body).toMatch(/closed_by = null/);
  });
});
