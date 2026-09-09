import { NextResponse } from "next/server";

import { NEWS_SOURCES, articleScope, newsAllowedHosts, shouldPublishNews } from "@plusone/config";
import { news } from "@plusone/logic";

import { isAuthorisedCron, serviceClient } from "@/lib/cron";

export const dynamic = "force-dynamic";

/** Long enough for a slow feed, short enough that one cannot hold the job open. */
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Past this, a source is reported as stale rather than merely quiet.
 *
 * Four months. Long enough that a slow publisher on a thin subject is not
 * flagged every run, short enough that a feed frozen since 2015 cannot hide
 * behind "nothing to report" for another quarter.
 */
const STALE_AFTER_MS = 120 * 24 * 60 * 60 * 1000;

/**
 * Latest news, gathered from the allowlist.
 *
 * Items publish on arrival, so the allowlist in packages/config/src/news.ts is
 * the only gate between an outside headline and a member — which is why this
 * reads nothing that is not on it, and why relevance is checked as well as
 * provenance. A trusted publisher's article about kindergarten vaccination
 * rates is a trusted article and is not news for this room.
 *
 * Deduplicated on the URL, so re-reading a feed every hour is free: a feed
 * repeats itself by design and `on conflict do nothing` is the whole answer.
 * That also means an admin deleting an item lets a corrected version back in
 * later, which a hidden flag would not.
 */
export async function POST(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const supabase = serviceClient();
  const allowed = new Set(newsAllowedHosts());

  // The rooms articles are posted into, read once. If they are missing there is
  // nothing to do and saying so beats writing nothing and reporting success.
  const { data: roomRows } = await supabase
    .from("rooms")
    .select("id, slug, community_scope")
    .like("slug", "latest-news-%");
  const rooms = (roomRows ?? []) as { id: string; slug: string; community_scope: string }[];
  if (rooms.length === 0) {
    return NextResponse.json({ error: "no latest-news rooms" }, { status: 500 });
  }
  const failures: string[] = [];
  /**
   * Sources that fetched fine and had nothing recent to say.
   *
   * A feed that 404s is already reported. The failure this missed is quieter and
   * is the one that actually happened: FOUR OF FIVE FEEDS returned 200 with
   * items from 2015, 2018 and 2023 — parsed cleanly, deduplicated to nothing,
   * and reported as a healthy run for months. The room simply stopped filling
   * and the job kept saying it was fine.
   *
   * So freshness is reported, not just reachability. This does not fail the run:
   * a quiet week is not an outage, and a cron that goes red on a slow news cycle
   * gets ignored. It puts the fact in the response where somebody reading the
   * log can see WHICH source died.
   */
  const stale: string[] = [];
  let added = 0;
  let seen = 0;

  for (const source of NEWS_SOURCES) {
    // The allowlist, checked at the moment of use rather than trusted from the
    // moment of writing. A redirect is what would otherwise carry this off it.
    if (!allowed.has(new URL(source.feedUrl).host)) {
      failures.push(`${source.key}: host not allowed`);
      continue;
    }

    let xml: string;
    try {
      const response = await fetch(source.feedUrl, {
        // Never follow one. A feed that redirects is a feed pointing somewhere
        // the allowlist has not vouched for, and following it would make the
        // list describe where we started rather than where we ended up.
        redirect: "error",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { accept: "application/rss+xml, application/atom+xml, application/xml" },
      });
      if (!response.ok) {
        failures.push(`${source.key}: ${response.status}`);
        continue;
      }
      xml = await response.text();
    } catch (cause) {
      // One source being down is not the job failing. Reported rather than
      // swallowed, because a feed that has quietly 404'd for a month looks
      // exactly like a feed with nothing to say.
      failures.push(`${source.key}: ${cause instanceof Error ? cause.message : "unreachable"}`);
      continue;
    }

    const parsed = news.parseFeed(xml);
    const items = parsed.filter((item) => {
      seen += 1;
      return shouldPublishNews(source, item);
    });

    // Read from the whole feed, not the filtered set: a source can be perfectly
    // alive and simply have published nothing on topic this quarter, and that is
    // a different fact from a feed that has not moved since 2015.
    const newest = parsed
      // Already a timestamp — feed.ts parses it. Date.parse on a number is a
      // string coercion and gives NaN for every item, which would have reported
      // nothing as stale ever.
      .map((item) => item.publishedAt)
      .filter((t): t is number => typeof t === "number" && Number.isFinite(t))
      .reduce((a, b) => Math.max(a, b), 0);
    if (newest > 0 && Date.now() - newest > STALE_AFTER_MS) {
      stale.push(`${source.key}: newest ${new Date(newest).toISOString().slice(0, 10)}`);
    }

    if (items.length === 0) continue;

    // Which Latest news rooms this belongs in.
    //
    // An article scoped to a community goes to that community's room; one
    // scoped 'all' goes to both, because a member only ever sees their own and
    // an article posted once would reach half the site. The two communities
    // then discuss it separately, which in a health community is the point
    // rather than the cost.
    for (const room of rooms) {
      /**
       * Per ARTICLE, not per source — which is the whole change.
       *
       * A source's scope says who its FEED is for. Three of the five are
       * general sexual-health publishers scoped `all`, and every one of their
       * articles went into every room: so an HIV-only piece from the CDC
       * reached somebody who has herpes, on a screen whose promise is that they
       * are among people who share their diagnosis.
       *
       * `articleScope` returns null for "no restriction" — an article that
       * mentions BOTH, or neither, goes everywhere. That is the safe default
       * twice over: covering both is exactly what should be kept, and a general
       * STI piece belongs in both rooms rather than in neither.
       *
       * A community-scoped SOURCE still ignores all of this. Its feed was
       * chosen for one community and nothing in an article's wording should be
       * able to move it.
       */
      const forRoom = items.filter((item) => {
        if (source.scope !== "all") return room.community_scope === source.scope;
        const only = articleScope(item);
        return only === null || only === room.community_scope;
      });
      if (forRoom.length === 0) continue;

      /**
       * Through `ingest_article`, not a PostgREST upsert — and this is the fix
       * for a three-week outage rather than a tidy-up.
       *
       * The upsert emitted `ON CONFLICT (room_id, article_url) DO NOTHING`, and
       * `room_messages_article_once_per_room` is a PARTIAL unique index
       * (`where article_url is not null`). Postgres refuses to use a partial
       * index as a conflict arbiter unless the statement repeats its predicate,
       * so EVERY article insert failed with "there is no unique or exclusion
       * constraint matching the ON CONFLICT specification" from the day that
       * index was created. PostgREST cannot express a predicate; a function can.
       *
       * The failure was reported all along, into a `failures` array in a cron
       * response nobody reads — which is why the room looked like a slow news
       * cycle for three weeks while ASHA kept publishing.
       */
      // One call per article rather than one per batch. The upsert took an
      // array; a function takes one row, and an article that fails validation —
      // a feed serving an http link, say — now fails alone instead of taking
      // the whole room's batch down with it.
      for (const item of forRoom) {
        const { data: inserted, error } = await supabase.rpc("ingest_article", {
          p_room_ids: [room.id],
          p_url: item.url,
          p_title: item.title,
          p_source: source.name,
          p_summary: item.summary,
          p_icon: source.icon ?? null,
          p_published_at: item.publishedAt ? new Date(item.publishedAt).toISOString() : null,
        });

        if (error) failures.push(`${source.key}/${room.slug}: ${error.message}`);
        else added += typeof inserted === "number" ? inserted : 0;
      }
    }
  }

  return NextResponse.json({ sources: NEWS_SOURCES.length, seen, added, failures, stale });
}

/**
 * Vercel Cron invokes with GET, not POST.
 *
 * Registering a schedule and exporting only POST produces a 405 on every fire —
 * a job that is scheduled, monitored, and has never once run. The Bearer check
 * in isAuthorisedCron is what guards this, and it is the same on both verbs.
 */
export const GET = POST;
