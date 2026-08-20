import type { Metadata } from "next";

import { DRAFT_COPY } from "@plusone/config";
import { chat as chatLogic } from "@plusone/logic";

import { getServerSupabase } from "@/lib/supabase";

export const metadata: Metadata = { title: DRAFT_COPY.app.newsHeading };

const C = DRAFT_COPY.app;

/**
 * Latest news, scoped to the member's community.
 *
 * The scoping is the policy's, not this page's: news_items carries the same
 * room_scope the rooms do, and its RLS reads viewer_community(). So this asks
 * for everything and gets back what the member may see — one wall, in the place
 * every other wall lives.
 */
export default async function NewsPage() {
  const supabase = await getServerSupabase();

  const [{ data }, { data: profile }] = await Promise.all([
    supabase
      .from("news_items")
      .select("id, title, url, summary, source_name, published_at")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(50),
    supabase.rpc("my_profile").maybeSingle<{ timezone: string | null }>(),
  ]);

  const items = data ?? [];
  const zone = profile?.timezone ?? "UTC";
  const now = Date.now();

  return (
    <main id="main">
      <h1 className="text-h2">{C.newsHeading}</h1>

      {/* Said before anything is read, not after. Everything below this was
          written by somebody else, and a member should know that before they
          take it as the product speaking. */}
      <p className="mt-3 text-[11.7px] leading-[1.6] text-ink-3">{C.newsNote}</p>

      {items.length === 0 ? (
        <p className="mt-8 text-[13px] text-ink-2">{C.newsEmpty}</p>
      ) : (
        <ul className="-mx-6 mt-6 border-t border-line">
          {items.map((item) => {
            const at = item.published_at ? Date.parse(item.published_at as string) : null;

            return (
              <li key={item.id as string} className="border-b border-line">
                <a
                  href={item.url as string}
                  target="_blank"
                  /**
                   * noreferrer, and it is the whole point.
                   *
                   * Without it the destination receives a Referer header naming
                   * this app — so an outside site learns that whoever arrived
                   * came from a health community. §8 keeps condition words out
                   * of our own paths for exactly this class of reason, and
                   * handing the visit to a third party undoes it on the one
                   * screen built for clicking out.
                   */
                  rel="noopener noreferrer"
                  className="ease-brand block px-6 py-4 transition-colors duration-200 hover:bg-surface"
                >
                  <p className="flex items-center gap-2 text-[11px] text-ink-3">
                    <span>{C.newsSourceLabel(item.source_name as string)}</span>
                    {at ? (
                      <time dateTime={new Date(at).toISOString()} className="tabular-nums">
                        {chatLogic.compactAge(at, now, zone)}
                      </time>
                    ) : null}
                  </p>

                  <h2 className="mt-1 text-[15px] leading-[1.4]">{item.title as string}</h2>

                  {item.summary ? (
                    <p className="mt-1.5 line-clamp-3 text-[12.4px] leading-[1.55] text-ink-2">
                      {item.summary as string}
                    </p>
                  ) : null}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
