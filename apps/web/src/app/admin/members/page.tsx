import type { Metadata } from "next";

import { getServerSupabase } from "@/lib/supabase";
import { RevealCondition } from "./reveal";

export const metadata: Metadata = { title: "Members" };

interface Hit {
  user_id: string;
  display_name: string | null;
  verification_status: string;
  created_at: string;
  open_reports: number;
}

/**
 * Member lookup (§7.3).
 *
 * Deliberately thin, and it only answers a question: there is no listing, no
 * browse, and a query under two characters returns nothing rather than
 * everyone. A moderator following a report needs to find one person; anything
 * more is a directory of members with a search box on it.
 *
 * No condition data. That is what `RevealCondition` is for, and it costs a
 * written reason.
 */
export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;

  const supabase = await getServerSupabase();
  const { data } =
    q.trim().length >= 2
      ? await supabase.rpc("admin_member_lookup", { p_query: q.trim() })
      : { data: [] };

  const hits = (data ?? []) as Hit[];

  return (
    <main id="main">
      <h1 className="mt-4 text-[clamp(1.9rem,5vw,2.4rem)]">Members</h1>

      <form method="get" className="mt-8 flex flex-wrap gap-3">
        <input
          name="q"
          type="search"
          defaultValue={q}
          minLength={2}
          placeholder="Display name or member id"
          aria-label="Display name or member id"
          className="min-w-[240px] flex-1 rounded-lg border border-line-2 bg-surface px-4 py-2.5 text-[15px] focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          className="ease-brand rounded-lg border border-line-2 px-5 py-2.5 text-[15px] transition-colors duration-200 hover:border-accent"
        >
          Look up
        </button>
      </form>

      {q.trim().length >= 2 && hits.length === 0 ? (
        <p className="mt-10 text-[16px] text-ink-2">Nobody matches that.</p>
      ) : null}

      {hits.length > 0 ? (
        <ul className="mt-10 flex flex-col gap-5">
          {hits.map((hit) => (
            <li key={hit.user_id} className="rounded-xl border border-line-2 bg-surface p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-[1.15rem]">{hit.display_name ?? "No name"}</h2>
                <span className="text-[13px] tracking-[0.04em] text-ink-3 uppercase">
                  {hit.verification_status}
                </span>
              </div>

              <p className="mt-2 text-[14px] text-ink-3">
                Joined {new Date(hit.created_at).toLocaleDateString()}
                {Number(hit.open_reports) > 0
                  ? ` · ${hit.open_reports} open report${Number(hit.open_reports) === 1 ? "" : "s"}`
                  : ""}
              </p>

              <RevealCondition memberId={hit.user_id} />
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
