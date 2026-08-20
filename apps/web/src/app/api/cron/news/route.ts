import { NextResponse } from "next/server";

import { NEWS_SOURCES, newsAllowedHosts, shouldPublishNews } from "@plusone/config";
import { news } from "@plusone/logic";

import { isAuthorisedCron, serviceClient } from "@/lib/cron";

export const dynamic = "force-dynamic";

/** Long enough for a slow feed, short enough that one cannot hold the job open. */
const FETCH_TIMEOUT_MS = 10_000;

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

    const items = news.parseFeed(xml).filter((item) => {
      seen += 1;
      return shouldPublishNews(source, item);
    });

    if (items.length === 0) continue;

    // Which Latest news rooms this belongs in.
    //
    // An article scoped to a community goes to that community's room; one
    // scoped 'all' goes to both, because a member only ever sees their own and
    // an article posted once would reach half the site. The two communities
    // then discuss it separately, which in a health community is the point
    // rather than the cost.
    const targets = rooms.filter(
      (room) => source.scope === "all" || room.community_scope === source.scope,
    );

    for (const room of targets) {
      const { error, count } = await supabase.from("room_messages").upsert(
        items.map((item) => ({
          room_id: room.id,
          // No author. An article is not something anybody here wrote, and a
          // system member sitting in profiles would be visible to every query
          // that assumes a profile row is a person.
          user_id: null,
          // The summary is the post's body, so an article reads like a post
          // rather than like a link with a heading.
          body: item.summary || item.title,
          article_url: item.url,
          article_title: item.title,
          article_source: source.name,
          article_icon: source.icon ?? null,
          created_at: item.publishedAt ? new Date(item.publishedAt).toISOString() : undefined,
        })),
        { onConflict: "room_id,article_url", ignoreDuplicates: true, count: "exact" },
      );

      if (error) failures.push(`${source.key}/${room.slug}: ${error.message}`);
      else added += count ?? 0;
    }
  }

  return NextResponse.json({ sources: NEWS_SOURCES.length, seen, added, failures });
}

/**
 * Vercel Cron invokes with GET, not POST.
 *
 * Registering a schedule and exporting only POST produces a 405 on every fire —
 * a job that is scheduled, monitored, and has never once run. The Bearer check
 * in isAuthorisedCron is what guards this, and it is the same on both verbs.
 */
export const GET = POST;
