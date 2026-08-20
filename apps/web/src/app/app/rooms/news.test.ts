import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const sql = read("../../../../../../supabase/migrations/20260820000300_an_article_is_a_post.sql");
const adminSql = read(
  "../../../../../../supabase/migrations/20260820000400_the_news_admin_follows_the_posts.sql",
);
const cron = read("../../api/cron/news/route.ts");
const row = read("./[roomId]/post-row.tsx");
const tabs = read("./room-tabs.tsx");
const layout = read("./layout.tsx");

/**
 * Latest news was a table of its own with a page of its own, and every request
 * for something posts already do was a second implementation of room_messages.
 */
describe("an article is a post", () => {
  it("lives in room_messages rather than a table beside it", () => {
    expect(sql).toMatch(/add column if not exists article_url text/);
    expect(adminSql).toMatch(/drop table if exists public\.news_items/);
  });

  /** Everything a post has, it has, because it is one. */
  it("inherits likes, comments and views without a line for any of them", () => {
    expect(sql).not.toMatch(/create table[\s\S]*?news_likes|news_comments|news_views/);
    expect(sql).toMatch(/from public\.room_likes l where l\.message_id = m\.id/);
    expect(sql).toMatch(/from public\.room_post_views v where v\.message_id = m\.id/);
  });

  /**
   * Nobody in this product wrote the article. The alternative was a system
   * member sitting in profiles, visible to every query that assumes a profile
   * row is a person.
   */
  it("has no author, and the shape says so", () => {
    expect(sql).toMatch(/alter column user_id drop not null/);
    expect(sql).toMatch(/article_url is not null\s*\n\s*and user_id is null/);
  });

  /**
   * `not i_am_blocked_with(user_id)` is NULL for a null author, and NOT NULL is
   * NULL — so without this every article would be silently filtered out of
   * every feed.
   */
  it("does not let an authorless row fall out of the block filter", () => {
    expect(sql).toMatch(
      /coalesce\(public\.is_blocked_either_way\(\(select auth\.uid\(\)\), p_other\), false\)/,
    );
  });

  /** Neither of which an article has, or needs. */
  it("keeps the alias and slow-mode triggers off it", () => {
    expect(sql).toMatch(/if not new\.anonymous or new\.user_id is null then/);
    expect(sql).toMatch(/if new\.user_id is null then\s*\n\s*return new;/);
  });

  it("is readable and never writable by a member", () => {
    expect(sql).toMatch(
      /grant select \([\s\S]*?article_url[\s\S]*?\)\s*\n\s*on public\.room_messages/,
    );
    expect(sql).not.toMatch(/grant insert[^;]*article_url/);
  });
});

/**
 * Rooms are scoped by community and news is too, so one 'all' room would show
 * HIV articles to somebody in the HSV community.
 */
describe("two rooms, one per community", () => {
  it("creates both, first in the bar", () => {
    expect(sql).toMatch(/'latest-news-hsv', 'Latest news', 'hsv', 0, 5/);
    expect(sql).toMatch(/'latest-news-hiv', 'Latest news', 'hiv', 0, 5/);
  });

  /** An article posted once would reach half the site. */
  it("posts an 'all' article to both", () => {
    expect(cron).toMatch(/source\.scope === "all" \|\| room\.community_scope === source\.scope/);
  });

  /** A unique index on the URL alone would store it for one and drop the other. */
  it("deduplicates per room, not globally", () => {
    expect(sql).toMatch(
      /on public\.room_messages \(room_id, article_url\) where article_url is not null/,
    );
    expect(cron).toMatch(/onConflict: "room_id,article_url"/);
  });

  /** A tab that is empty until you press a button you were never shown. */
  it("puts every member in their own news room, now and on arrival", () => {
    expect(sql).toMatch(
      /insert into public\.room_members \(room_id, user_id\)\s*\nselect r\.id, p\.id/,
    );
    expect(sql).toMatch(/create trigger profiles_join_news_room/);
  });

  /** It arrives with the others and sorts by position like the others. */
  it("needs no special case in the bar", () => {
    expect(tabs).not.toMatch(/"news"/);
    expect(layout).not.toMatch(/newsHeading/);
  });
});

describe("what an article looks like", () => {
  it("wears the publisher's mark where a face would be", () => {
    expect(row).toMatch(/post\.article_url \? \(/);
    expect(row).toMatch(/src=\{post\.article_icon \?\? ""\}/);
  });

  /**
   * Fetching it otherwise tells the publisher's server that somebody in a
   * health community is reading them — the same visit the link takes care not
   * to hand over.
   */
  it("asks for the mark without saying who is asking", () => {
    expect(row).toMatch(/referrerPolicy="no-referrer"/);
  });

  /** The title opens the article; everything around it opens the thread. */
  it("makes the headline the way out, above the row's own link", () => {
    expect(row).toMatch(/href=\{post\.article_url\}[\s\S]{0,200}rel="noopener noreferrer"/);
    expect(row).toMatch(/relative z-20 mt-1 block text-\[16px\]/);
  });

  /** So an article reads like a post rather than a link with a heading over it. */
  it("uses the summary as the post's body", () => {
    expect(cron).toMatch(/body: item\.summary \|\| item\.title/);
  });
});

describe("the admin follows them", () => {
  it("lists, edits and deletes through admin-only functions", () => {
    for (const fn of ["admin_articles", "admin_update_article", "admin_delete_article"]) {
      expect(adminSql, fn).toMatch(new RegExp(`function public\\.${fn}\\(`));
    }
    expect(adminSql.match(/is_admin\(\)/g)?.length).toBeGreaterThanOrEqual(3);
  });

  /** A soft delete would keep the article out forever; the ingest dedupes on url. */
  it("really deletes, so a corrected version can come back", () => {
    const fn = adminSql.slice(adminSql.indexOf("function public.admin_delete_article"));
    expect(fn).toMatch(/delete from public\.room_messages where id = p_id/);
    expect(fn.slice(0, fn.indexOf("$$;"))).not.toMatch(/deleted_at/);
  });

  it("audits what it changed", () => {
    expect(adminSql).toMatch(/perform public\.audit\('news\.article_updated'/);
    expect(adminSql).toMatch(/perform public\.audit\('news\.article_deleted'/);
  });
});
