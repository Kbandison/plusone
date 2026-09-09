import { NextResponse } from "next/server";

import { parseServerEnv } from "@plusone/config";

import { serviceClient } from "@/lib/cron";

/**
 * The machine path into Latest news.
 *
 * An agent can read the publishers the ingest cannot — POZ, aidsmap, Positively
 * Aware, Westover Heights, Medical Xpress — all of which refuse a non-browser
 * agent while serving a person fine. Measured 2026-09-09: nine HSV articles on
 * offer across every feed the cron can reach, against a hundred and twelve HIV
 * ones. This is how that gap gets closed.
 *
 * ── it is the same wall as the form ────────────────────────────────────────
 *
 * `ingest_article` holds the rules — https only, a headline, a source, Latest
 * news rooms only, deduplicated on (room_id, article_url) — and the admin form
 * reaches them through `admin_post_article`, which is now just an is_admin()
 * wrapper around the same function. Two doors, one lock. Nothing here validates
 * an article; if it did, that copy is what would drift.
 *
 * ── the secret is NOT CRON_SECRET ──────────────────────────────────────────
 *
 * That one opens /api/cron/purge, which deletes accounts. This one may add a
 * news article and nothing else, so a token pasted into an outside tool cannot
 * be turned into account deletion if it leaks. It is also optional: unset, this
 * route refuses everything, because an unconfigured ingest should be closed
 * rather than open.
 */
export const dynamic = "force-dynamic";

interface ArticleInput {
  url?: unknown;
  title?: unknown;
  source?: unknown;
  summary?: unknown;
  icon?: unknown;
  scope?: unknown;
  publishedAt?: unknown;
}

/** Constant time, because a timing-variable compare on a bearer token leaks it. */
function secretMatches(presented: string, expected: string): boolean {
  if (presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < presented.length; i++) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function authorised(request: Request): boolean {
  const { NEWS_INGEST_SECRET } = parseServerEnv(process.env);
  // Unset means closed. Without this, an unconfigured deploy would accept an
  // empty bearer token as matching an empty secret.
  if (!NEWS_INGEST_SECRET) return false;
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  return presented.length > 0 && secretMatches(presented, NEWS_INGEST_SECRET);
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export async function POST(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a json body" }, { status: 400 });
  }

  // One article or many. An agent that finds four things in a run should not
  // have to make four requests, and a single object is the obvious thing to try
  // first — accepting both costs one line and saves a round of "why 400".
  const raw = body as { articles?: unknown };
  const articles: ArticleInput[] = Array.isArray(raw?.articles)
    ? (raw.articles as ArticleInput[])
    : [body as ArticleInput];

  if (articles.length === 0) {
    return NextResponse.json({ error: "no articles" }, { status: 400 });
  }
  // A bound, so a malformed or runaway caller cannot post a thousand rows into a
  // community's room in one request.
  if (articles.length > 25) {
    return NextResponse.json({ error: "at most 25 articles per request" }, { status: 400 });
  }

  const supabase = serviceClient();

  // Read once. Every article resolves its rooms against this rather than
  // querying per item.
  const { data: roomRows } = await supabase
    .from("rooms")
    .select("id, community_scope")
    .like("slug", "latest-news-%");
  const rooms = (roomRows ?? []) as { id: string; community_scope: string }[];
  if (rooms.length === 0) {
    return NextResponse.json({ error: "no latest-news rooms" }, { status: 500 });
  }

  const results: { url: string; added: number; error?: string }[] = [];

  for (const article of articles) {
    const url = str(article.url);
    const scope = str(article.scope).toLowerCase();

    // "both" is spelled out rather than being what you get by leaving it off.
    // The scope call is the one an agent is most likely to get wrong — a feed
    // filed tuberculosis under herpes — so it has to be made, not defaulted.
    if (scope !== "hsv" && scope !== "hiv" && scope !== "both") {
      results.push({ url, added: 0, error: 'scope must be "hsv", "hiv" or "both"' });
      continue;
    }

    const targets = rooms.filter((r) => scope === "both" || r.community_scope === scope);
    if (targets.length === 0) {
      results.push({ url, added: 0, error: `no Latest news room for scope ${scope}` });
      continue;
    }

    // The article's own date, not this request's. An agent posting four things
    // it found this morning would otherwise stamp all four with the minute it
    // ran, and the room sorts on created_at — so a piece from March would sit
    // above one from last week. Unparseable or absent falls back to now() in the
    // function rather than failing the article; a wrong date is worth less than
    // the article, and a caller is told nothing was wrong so it will not retry.
    const published = new Date(str(article.publishedAt));
    const publishedAt = Number.isNaN(published.getTime()) ? null : published.toISOString();

    const { data, error } = await supabase.rpc("ingest_article", {
      p_room_ids: targets.map((r) => r.id),
      p_url: url,
      p_title: str(article.title),
      p_source: str(article.source),
      p_summary: str(article.summary),
      p_icon: str(article.icon),
      p_published_at: publishedAt,
    });

    if (error) {
      // The function's own refusals are written for a person and say which
      // field is wrong. Passing them through is what stops an agent retrying a
      // typo forever against "that didn't work".
      results.push({ url, added: 0, error: error.message });
      continue;
    }
    results.push({ url, added: typeof data === "number" ? data : 0 });
  }

  const added = results.reduce((n, r) => n + r.added, 0);
  const failed = results.filter((r) => r.error).length;

  // Counts, and no article text. An article URL is public and would be safe,
  // but the log is the wrong place to start keeping a second copy of what a
  // community was shown — the room already holds that, and §9.6's habit is to
  // log the shape rather than the contents.
  console.info(JSON.stringify({ at: "news.ingest", articles: articles.length, added, failed }));

  // 207 when some worked and some did not, so a caller cannot read a 200 as
  // "all four posted" when one had a bad link.
  return NextResponse.json(
    { added, failed, results },
    { status: failed > 0 && added > 0 ? 207 : failed > 0 ? 400 : 200 },
  );
}
