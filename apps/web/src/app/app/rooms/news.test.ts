import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const sql = read("../../../../../../supabase/migrations/20260820000300_an_article_is_a_post.sql");
const adminSql = read(
  "../../../../../../supabase/migrations/20260820000400_the_news_admin_follows_the_posts.sql",
);
const cron = read("../../api/cron/news/route.ts");
// The article insert itself. It moved out of the cron and into a function so
// three callers — the cron, the admin form and the agent ingest — share one
// conflict clause; 20260909000300 is the live definition.
const ingestSql = read(
  "../../../../../../supabase/migrations/20260909000300_the_conflict_target_needs_its_predicate.sql",
);
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
  it("posts an 'all' article to both — unless the article names one condition", () => {
    // The rule CHANGED rather than moved. It used to be per source: anything
    // from a general publisher went to every room, which sent HIV-only pieces
    // to people who have herpes. It is now per article, and "both" survives as
    // the default for a piece naming neither condition or both.
    //
    // The behaviour itself is covered by news.test.ts in packages/config, which
    // calls articleScope with real headlines. This only asserts the cron asks.
    expect(cron).toMatch(/const only = articleScope\(item\);/);
    expect(cron).toMatch(/only === null \|\| only === room\.community_scope/);
    expect(cron).not.toMatch(/const targets = rooms\.filter/);
  });

  /** A unique index on the URL alone would store it for one and drop the other. */
  it("deduplicates per room, not globally", () => {
    expect(sql).toMatch(
      /on public\.room_messages \(room_id, article_url\) where article_url is not null/,
    );
    // The cron no longer writes the conflict clause itself. It went through a
    // PostgREST upsert, which emits `ON CONFLICT (room_id, article_url)` with no
    // predicate and has no way to add one — so it could not match the PARTIAL
    // index above and every insert failed from the day that index was created.
    // Latest news was frozen for three weeks on exactly this. The clause lives
    // in ingest_article now, where a predicate can be written; the assertion
    // that it carries one is in api/news/ingest/route.test.ts.
    expect(cron).toMatch(/supabase\.rpc\("ingest_article"/);
    expect(cron).not.toMatch(/onConflict/);
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
    // Both halves of the condition. This assertion used to pin
    // `src={post.article_icon ?? ""}` — it was describing the shape exactly and
    // the shape was wrong, because an article may have no mark and an empty src
    // is not an empty state. Pinning a literal is only as good as the literal.
    expect(row).toMatch(/post\.article_url && post\.article_icon \? \(/);
    expect(row).toMatch(/src=\{post\.article_icon\}/);
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
    expect(row).toMatch(/relative z-20 mt-0\.5 block text-\[15px\]/);
  });

  /** So an article reads like a post rather than a link with a heading over it. */
  it("uses the summary as the post's body", () => {
    // Moved into ingest_article with the insert, so the hand-posted article and
    // the gathered one fall back the same way rather than in two places.
    expect(cron).toMatch(/p_summary: item\.summary/);
    expect(ingestSql).toMatch(/if v_body = '' then\s*\n\s*v_body := v_title;/);
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

const share = read("./[roomId]/share-menu.tsx");
const modal = read("../../modal.tsx");

/**
 * As a dropdown it was wrong three ways at once, and all three were the same
 * fact: it hung from a control near the left edge with the panel anchored
 * right, and it lived inside the counts row's z-20 stacking context — where
 * nothing it set for itself could lift it over a nav at z-40, because a child
 * cannot outrank its parent's layer.
 */
describe("the share control is a sheet, not a dropdown", () => {
  it("uses a dialog, which is in the top layer", () => {
    expect(share).toMatch(/<Modal/);
    expect(share).not.toMatch(/OverflowMenu/);
  });

  /**
   * Flush to the bottom on a phone, like every other sheet here. Held off the
   * nav it read as a panel floating in the middle of nothing — and covering the
   * nav costs nothing, because showModal() has already made everything behind
   * it inert.
   */
  it("reaches the bottom of the screen", () => {
    expect(share).toMatch(/panelClassName="pb-10 sm:bottom-auto sm:pb-6"/);
    expect(share).not.toMatch(/bottom-20/);
  });

  /** Somebody chose to bring it, and that is most of what a share means. */
  it("says who shared it", () => {
    expect(row).toMatch(/C\.postSharedBy\(post\.shared_by_name\)/);
    const migration = read(
      "../../../../../../supabase/migrations/20260820000700_who_shared_it.sql",
    );
    expect(migration).toMatch(/add column if not exists shared_by uuid/);
    expect(migration).toMatch(/sp\.display_name/);
  });

  /**
   * An article has no author to block, so without this a member could block
   * somebody and keep seeing everything that person chose to bring in.
   */
  it("hides a share from somebody the viewer blocked", () => {
    const migration = read(
      "../../../../../../supabase/migrations/20260820000700_who_shared_it.sql",
    );
    expect(migration.match(/i_am_blocked_with\(m\.shared_by\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  /**
   * `m-0 mt-auto` asks the browser to resolve auto margins inside a UA dialog
   * box that already sets inset, margin and its own max-height. RouteModal
   * learned that the expensive way; Modal had the same shape and had not been
   * caught.
   */
  it("pins the panel rather than asking for it", () => {
    expect(modal).toMatch(/fixed inset-x-0 top-auto bottom-0 mx-auto/);
    const code = modal
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*)/.test(line))
      .join("\n");
    expect(code).not.toMatch(/m-0 mt-auto/);
  });

  /** navigator.share exists on phones and nowhere else. */
  it("keeps a clipboard fallback for everywhere it does not", () => {
    expect(share).toMatch(/typeof navigator\.share === "function"/);
    expect(share).toMatch(/navigator\.clipboard\.writeText\(url\)/);
  });

  /** Reading it during render would make the server and client markup disagree. */
  it("checks for it after mount", () => {
    // Tolerates a comment between the two, which is where the eslint
    // directive for react-hooks/set-state-in-effect now sits. What is being
    // asserted is unchanged: setCanShare is reached through an effect and not
    // during render.
    expect(share).toMatch(/useEffect\(\(\) => \{[^}]*setCanShare/);
  });
});

describe("the news job says when a source has gone quiet", () => {
  const route = readFileSync(
    fileURLToPath(new URL("../../api/cron/news/route.ts", import.meta.url)),
    "utf8",
  );

  it("routes each article by its own subject, not the source's", () => {
    // A source's scope says who its FEED is for; it cannot say who an ARTICLE
    // is for. Three of five are general publishers scoped `all`.
    expect(route).toMatch(/articleScope\(item\)/);
    expect(route).toMatch(/only === null \|\| only === room\.community_scope/);
  });

  it("still lets a community-scoped source override the article", () => {
    // A feed chosen for one community stays there whatever an article's wording
    // suggests — otherwise a stray word could move thebody.com into the HSV room.
    expect(route).toMatch(
      /if \(source\.scope !== "all"\) return room\.community_scope === source\.scope;/,
    );
  });

  it("reports staleness, not just reachability", () => {
    // The failure that actually happened: four of five feeds returned 200 with
    // items from 2015, 2018 and 2023 — parsed cleanly, deduplicated to nothing,
    // reported as a healthy run for months.
    expect(route).toMatch(/const stale: string\[\]/);
    expect(route).toMatch(/STALE_AFTER_MS/);
    expect(route).toMatch(/failures,\s*stale/);
  });

  it("measures freshness on the whole feed, not the filtered set", () => {
    // A live source that published nothing on topic this quarter is not a dead
    // feed, and conflating them makes the warning useless.
    const block = route.slice(route.indexOf("const newest ="));
    expect(block.slice(0, 400)).toMatch(/parsed/);
    expect(route.indexOf("const parsed =")).toBeLessThan(route.indexOf("const newest ="));
  });

  it("does not fail the run on a quiet week", () => {
    // A cron that goes red on a slow news cycle gets ignored, and then the real
    // outage is invisible too.
    expect(route).not.toMatch(/stale[\s\S]{0,80}status: 5/);
  });
});

describe("an article with no mark", () => {
  const postRow = read("./[roomId]/post-row.tsx");

  it("renders the neutral frame instead of an empty src", () => {
    // `src={post.article_icon ?? ""}` was reachable: the agent ingest does not
    // require an icon and thirteen live rows had none. An empty src is not an
    // empty state — it renders broken, and historically resolved to the current
    // document, which is the page requesting itself from inside itself.
    expect(postRow).toMatch(/post\.article_url && post\.article_icon \?/);
  });

  it("does not reach the img with a nullish fallback", () => {
    expect(postRow).not.toMatch(/src=\{post\.article_icon \?\? ""\}/);
  });
});
