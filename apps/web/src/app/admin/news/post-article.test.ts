import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const MIGRATIONS = new URL("../../../../../../supabase/migrations/", import.meta.url);
const sql = readdirSync(fileURLToPath(MIGRATIONS))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(fileURLToPath(new URL(f, MIGRATIONS)), "utf8"))
  .join("\n");

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const noComments = (src: string) =>
  src.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, "").replace(/^[ \t]*(--|\/\/)[^\n]*$/gm, "");

const code = noComments(sql);
const fn =
  /create or replace function public\.admin_post_article[\s\S]*?\$\$;/.exec(code)?.[0] ?? "";
const form = read("./post-article.tsx");
const action = read("./actions.ts");

/**
 * Posting an article by hand.
 *
 * It exists because of a measurement rather than a preference: nine HSV
 * articles on offer across every live feed against a hundred and twelve HIV
 * ones, and the few HSV publishers that do exist refuse a robot. The guards
 * below are about it staying the SAME thing the ingest posts.
 */
describe("a hand-posted article is the ingest's shape, not a second kind of post", () => {
  it("finds the function", () => {
    expect(fn.length).toBeGreaterThan(500);
  });

  it("writes the columns that make a room_message an article", () => {
    // article_url is what every surface keys on. Missing one of these produces
    // a post that renders as a member's words with no author.
    for (const col of ["article_url", "article_title", "article_source", "article_icon"]) {
      expect(fn, `${col} not written`).toMatch(new RegExp(col));
    }
    // No author, like the ingest's. A hand-posted article is not somebody's
    // words, and a system member sitting in `profiles` would be visible to
    // every query that assumes a profile row is a person.
    expect(fn).toMatch(/\(room_id, user_id, body, article_url/);
    expect(fn).toMatch(/values\s*\(v_room, null,/);
  });

  it("deduplicates on the same key the cron uses", () => {
    // So posting something the feed later picks up is a no-op. A different
    // conflict target would double every article the ingest catches up on.
    expect(fn).toMatch(/on conflict \(room_id, article_url\) do nothing/);
  });
});

describe("what the function refuses", () => {
  it("refuses a non-admin", () => {
    expect(fn).toMatch(/if not public\.is_admin\(\) then/);
  });

  it("refuses a link that is not https", () => {
    // Checked in the DATABASE, not the form: the form is one caller and this is
    // the wall. article_url is rendered as a link on six surfaces, and an http
    // one is a downgrade a member cannot see coming.
    expect(fn).toMatch(/\^https:\/\//);
  });

  it("refuses any room that is not a Latest news room", () => {
    // Without it an admin could put an authorless post into a discussion room,
    // where it reads as a member who deleted themselves.
    expect(fn).toMatch(/slug like 'latest-news-%'/);
    expect(fn).toMatch(/not a Latest news room/);
  });

  it("refuses an article with no headline or no source", () => {
    expect(fn).toMatch(/an article needs a headline/);
    expect(fn).toMatch(/an article needs a source/);
  });
});

describe("the form makes the scope decision explicit", () => {
  it("preselects no room", () => {
    // The scope call is the one thing a person is here to make, and the one the
    // ingest gets wrong on its own — ScienceDaily files tuberculosis under
    // herpes. A ticked box would let an article reach a community by default.
    const boxes = form.slice(form.indexOf('name="roomId"'), form.indexOf("</fieldset>"));
    expect(boxes).not.toMatch(/defaultChecked|checked=/);
  });

  it("refuses to post with no room chosen, rather than silently doing nothing", () => {
    expect(action).toMatch(/roomIds\.length === 0/);
    expect(action).toMatch(/Choose at least one room/);
  });

  it("tells 'posted' apart from 'the feed already had it'", () => {
    // Both are successes and they mean different things. The count is why the
    // function returns one.
    expect(action).toMatch(/Already posted/);
    expect(fn).toMatch(/returns integer/);
  });

  it("lists rooms through a definer function, not a select", () => {
    // `rooms` is readable only where community_scope matches the viewer's own,
    // so an admin who has HSV cannot see the HIV news room at all.
    expect(read("./page.tsx")).toMatch(/admin_news_rooms/);
    expect(code).toMatch(
      /create or replace function public\.admin_news_rooms[\s\S]*?security definer/,
    );
  });
});
