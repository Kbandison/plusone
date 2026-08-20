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

    const { error, count } = await supabase.from("news_items").upsert(
      items.map((item) => ({
        source_key: source.key,
        source_name: source.name,
        community_scope: source.scope,
        title: item.title,
        url: item.url,
        summary: item.summary || null,
        published_at: item.publishedAt ? new Date(item.publishedAt).toISOString() : null,
      })),
      { onConflict: "url", ignoreDuplicates: true, count: "exact" },
    );

    if (error) failures.push(`${source.key}: ${error.message}`);
    else added += count ?? 0;
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
