import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const MIGRATIONS = new URL("../../../../../../../supabase/migrations/", import.meta.url);
const sql = readdirSync(fileURLToPath(MIGRATIONS))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(fileURLToPath(new URL(f, MIGRATIONS)), "utf8"))
  .join("\n");

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const noComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(--|\/\/)[^\n]*$/gm, "");

const code = noComments(sql);
const fn =
  /create or replace function public\.delete_own_room_message[\s\S]*?\$\$;/.exec(code)?.[0] ?? "";
const row = read("./post-row.tsx");
const control = read("./delete-post.tsx");

describe("a member can withdraw their own post, and only their own", () => {
  it("finds the function", () => {
    expect(fn.length).toBeGreaterThan(300);
  });

  it("flags the row rather than removing it", () => {
    // reports.reported_room_message_id is `on delete set null`, so deleting the
    // row strips a report of its subject and leaves a moderator judging an
    // accusation with nothing attached. RLS already hides a flagged row from
    // every member — 20260814001000 reads `deleted_at is null` — so the body
    // stays exactly where moderation can still reach it.
    expect(fn).not.toMatch(/delete\s+from\s+public\.room_messages/);
    expect(fn).toMatch(/set deleted_at = now\(\)/);
    // And it does NOT blank the content, which is the half that keeps the
    // evidence.
    expect(fn).not.toMatch(/body = null/);
  });

  it("records the author as the remover, not a moderator", () => {
    // A post withdrawn by the person who wrote it and one removed by moderation
    // are different events, and deleted_by is the only thing telling them apart.
    expect(fn).toMatch(/deleted_by = v_uid/);
  });

  it("refuses anybody but the author", () => {
    expect(fn).toMatch(/v_row\.user_id <> v_uid/);
  });

  it("answers not-found and not-yours identically", () => {
    // Otherwise this reveals whether a post id exists in a room the caller
    // cannot see.
    expect(fn).toMatch(/v_row\.id is null or v_row\.user_id <> v_uid/);
  });

  it("is a no-op the second time", () => {
    expect(fn).toMatch(/if v_row\.deleted_at is not null then\s+return;/);
  });

  it("runs as definer, since no member may write that column", () => {
    expect(fn).toMatch(/security definer/);
  });
});

describe("the two menus have nothing in common", () => {
  it("offers Delete on your own post and never Report or Block", () => {
    // You cannot report or block yourself; nobody else may withdraw your words.
    // So this is not one menu with items hidden — it is two menus.
    const mine =
      /post\.is_mine \? \([\s\S]*?\) : !post\.article_url/.exec(noComments(row))?.[0] ?? "";
    expect(mine.length).toBeGreaterThan(60);
    expect(mine).toMatch(/<DeletePost/);
    expect(mine).not.toMatch(/ReportControl|BlockButton/);
  });

  it("keeps Report and Block on somebody else's", () => {
    const theirs = noComments(row).slice(noComments(row).indexOf(": !post.article_url"));
    expect(theirs).toMatch(/ReportControl/);
    expect(theirs).toMatch(/BlockButton/);
    expect(theirs).not.toMatch(/<DeletePost/);
  });
});

describe("it says what goes with it", () => {
  it("warns that replies go too, before the destructive press", () => {
    // room_feed nests replies under their parent, so withdrawing a post takes
    // other people's answers out of view. Allowed — this app exists so somebody
    // can control their own disclosure, and a stranger's reply must not put
    // them in charge of it — but not something to find out afterwards.
    expect(control).toMatch(/postDeleteWarning/);
    const confirm = control.slice(control.indexOf("if (!asking)"));
    expect(confirm.indexOf("postDeleteWarning")).toBeLessThan(confirm.indexOf("postDeleteConfirm"));
  });

  it("takes two presses", () => {
    expect(control).toMatch(/setAsking\(true\)/);
    expect(control).toMatch(/setAsking\(false\)/);
  });
});

describe("the open menu outranks everything else the row lifts", () => {
  /** Every z-N this row puts on something, as numbers. */
  const zOf = (src: string) => [...src.matchAll(/\bz-(\d+)\b/g)].map((m) => Number(m[1]));

  it("puts the menus strictly above the rest of the row", () => {
    // Not "the menu is z-30" — the rule is that it BEATS the others, and
    // pinning the literal would pass the day somebody raises the action strip
    // to match it. Which is precisely the bug: at equal z the later element in
    // the DOM wins, and both the image trigger and the Share strip come after
    // the menu.
    const src = noComments(row);
    const menus = [...src.matchAll(/<span className="relative z-(\d+)">/g)].map((m) =>
      Number(m[1]),
    );
    expect(menus.length).toBe(2);

    const others = zOf(src.replace(/<span className="relative z-\d+">/g, ""));
    expect(others.length).toBeGreaterThan(2);
    for (const menu of menus) {
      expect(Math.min(...menus), "both menus sit at the same height").toBe(menu);
      expect(menu).toBeGreaterThan(Math.max(...others));
    }
  });

  it("lifts the wrapper, not the panel, so the whole subtree comes with it", () => {
    // OverflowMenu's panel is absolute z-20 INSIDE the span. Raising the panel
    // alone would do nothing — it is already the top of its own context; what
    // has to move is the context.
    const menu = read("../../overflow-menu.tsx");
    expect(menu).toMatch(/absolute z-20/);
    expect(noComments(row)).toMatch(/<span className="relative z-30">/);
  });
});
