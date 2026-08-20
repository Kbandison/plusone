import type { Metadata } from "next";

import { NEWS_SOURCES } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";
import { NewsItemRow, type NewsRow } from "./news-row";

export const metadata: Metadata = { title: "News" };

/**
 * What the ingest has brought in, and the two things to do about it.
 *
 * Items publish on arrival — Kevin's call — so this screen is not an approval
 * queue. It is the place a headline comes back off, which is a different job
 * and a shorter one.
 *
 * The sources are listed above the items because the question this screen most
 * often has to answer is not "is this article right" but "why is there nothing
 * here", and the answer to that is usually a feed that has stopped responding.
 */
export default async function AdminNewsPage() {
  const supabase = await getServerSupabase();

  const { data } = await supabase
    .from("news_items")
    .select("id, title, url, summary, source_name, community_scope, published_at")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(200);

  const items = (data ?? []) as NewsRow[];

  return (
    <main id="main">
      <h1 className="mt-4 text-h2">News</h1>
      <p className="mt-4 max-w-[54ch] text-[13px] leading-[1.7] text-ink-2">
        Gathered every six hours from the allowlist and published on arrival. Deleting an item
        removes it; the ingest can bring a corrected version back later, which is why this is a
        delete rather than a hidden flag.
      </p>

      <section className="mt-8">
        <h2 className="text-[0.891rem] tracking-[0.04em] text-ink-3 uppercase">Sources</h2>
        <ul className="mt-3 flex flex-col gap-1.5 text-[12px] text-ink-2">
          {NEWS_SOURCES.map((source) => (
            <li key={source.key} className="flex flex-wrap items-center gap-2">
              <span>{source.name}</span>
              <span className="rounded-full border border-line-2 px-2 py-0.5 text-[10.5px] text-ink-3">
                {source.scope}
              </span>
              <span className="truncate text-[10.5px] text-ink-3">{source.feedUrl}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-ink-3">
          Adding or removing a source is a change to packages/config/src/news.ts, not to this screen
          — an allowlist that can be edited from a web page is not much of an allowlist.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-[0.891rem] tracking-[0.04em] text-ink-3 uppercase">
          Items ({items.length})
        </h2>

        {items.length === 0 ? (
          <p className="mt-4 text-[12.6px] text-ink-2">
            Nothing yet. The job runs every six hours; a source that has stopped responding shows up
            in its response rather than here.
          </p>
        ) : (
          <ul className="mt-3">
            {items.map((item) => (
              <NewsItemRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
