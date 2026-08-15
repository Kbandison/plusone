import type { Metadata } from "next";
import Link from "next/link";

import { COPY, DRAFT_COPY, INTENTION_LABELS, RADIUS, type Intention } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";

export const metadata: Metadata = { title: DRAFT_COPY.app.navBrowse };

const C = DRAFT_COPY.app;
const DAY = 24 * 60 * 60 * 1000;

/**
 * Browse (§7.2) — the secondary directory.
 *
 * Reads `visible_profiles`, so every wall applies before a row exists. The
 * filters narrow what is already permitted; they cannot widen it, because there
 * is nothing here that queries `profiles` directly.
 *
 * The activity stat is a real count from the same filtered set. §3.4 calls it an
 * honest stat, and the way to keep it honest is to derive it from the rows on
 * the page rather than from a separate, friendlier query.
 */
export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ distance?: string; intention?: string; active?: string }>;
}) {
  const filters = await searchParams;
  const distanceMi = Number(filters.distance) || RADIUS.maxMi;
  const intention = filters.intention as Intention | undefined;
  const activeOnly = filters.active === "1";

  const supabase = await getServerSupabase();
  let query = supabase
    .from("visible_profiles")
    .select("id, display_name, age, intention, distance_mi, last_active_at")
    .lte("distance_mi", distanceMi)
    .order("last_active_at", { ascending: false })
    .limit(60);

  if (intention && intention in INTENTION_LABELS) query = query.eq("intention", intention);
  if (activeOnly) query = query.gte("last_active_at", new Date(Date.now() - 7 * DAY).toISOString());

  const { data } = await query;
  const rows = data ?? [];

  const activeThisWeek = rows.filter(
    (row) => Date.parse(row.last_active_at as string) >= Date.now() - 7 * DAY,
  ).length;

  return (
    <main id="main">
      <h1 className="text-[clamp(1.9rem,5.5vw,2.4rem)]">{C.navBrowse}</h1>

      {/* §3.4, verbatim — real counts only, never inflated. */}
      <p className="mt-4 text-[15px] text-ink-2">
        {COPY.browse.activityStat(activeThisWeek, distanceMi)}
      </p>

      <form className="mt-8 flex flex-wrap items-end gap-4" method="get">
        <label className="flex flex-col gap-2 text-[13.5px] text-ink-2">
          {C.filterDistance}
          <select
            name="distance"
            defaultValue={String(distanceMi)}
            className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[15px] focus:border-accent focus:outline-none"
          >
            {RADIUS.ladderMi.map((mi) => (
              <option key={mi} value={mi}>
                {mi} miles
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-[13.5px] text-ink-2">
          {C.filterIntention}
          <select
            name="intention"
            defaultValue={intention ?? ""}
            className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[15px] focus:border-accent focus:outline-none"
          >
            <option value="">{C.filterAny}</option>
            {(Object.keys(INTENTION_LABELS) as Intention[]).map((value) => (
              <option key={value} value={value}>
                {INTENTION_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2.5 text-[14.5px]">
          <input
            type="checkbox"
            name="active"
            value="1"
            defaultChecked={activeOnly}
            className="size-[18px] accent-accent"
          />
          {C.filterActive}
        </label>

        <button
          type="submit"
          className="ease-brand rounded-lg border border-line-2 px-5 py-2.5 text-[15px] transition-colors duration-200 hover:border-accent"
        >
          {C.applyFiltersLabel}
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="mt-10 text-[16px] text-ink-2">{C.browseEmpty}</p>
      ) : (
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {rows.map((row) => (
            <li key={row.id as string} className="rounded-xl border border-line-2 bg-surface p-5">
              <Link href={`/app/connect/${row.id as string}?source=browse`} className="block">
                <h2 className="text-[1.2rem]">{(row.display_name as string) ?? "Someone"}</h2>
              <p className="mt-1.5 text-[14px] text-ink-3">
                {[row.age, row.distance_mi != null ? `${row.distance_mi} mi` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
                {row.intention ? (
                  <p className="mt-3 text-[14.5px] text-ink-2">
                    {INTENTION_LABELS[row.intention as Intention]}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
