import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { COPY, DRAFT_COPY, INTENTION_LABELS, RADIUS, type Intention } from "@plusone/config";

import { photosFor } from "@/lib/photo-urls";
import { getServerSupabase } from "@/lib/supabase";
import { MemberPhotoFrame } from "../member-photo";
import { buttonClass } from "@/app/ui";

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
  searchParams: Promise<{
    distance?: string;
    intention?: string;
    active?: string;
  }>;
}) {
  const filters = await searchParams;
  const distanceMi = Number(filters.distance) || RADIUS.maxMi;
  const intention = filters.intention as Intention | undefined;
  const activeOnly = filters.active === "1";

  const supabase = await getServerSupabase();

  // Browse is a dating surface, and a support-only member is not on it.
  //
  // Decision #17 makes support-only a shield that removes somebody from every
  // dating surface, and Decision #19 gives them a Preview Drop instead —
  // photos blurred, names hidden, one call to action: "Switch to dating to see
  // and connect." All of that redaction was contradicted one tab away, because
  // can_view_profile's mode wall passes every dating target for a support-only
  // viewer and Browse reads clear photos and display names straight off
  // visible_profiles. The preview only means something if this is closed.
  const { data: me } = await supabase.rpc("my_profile").maybeSingle<{ mode: string | null }>();
  if (me?.mode === "support_only") redirect("/app");

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

  const photos = await photosFor(rows.map((row) => row.id as string));

  const activeThisWeek = rows.filter(
    (row) => Date.parse(row.last_active_at as string) >= Date.now() - 7 * DAY,
  ).length;

  return (
    <main id="main">
      <h1 className="text-h2">{C.navBrowse}</h1>

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
            className="rounded-lg border border-line-control bg-surface px-3.5 py-2.5 text-[16px] focus:border-accent"
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
            className="rounded-lg border border-line-control bg-surface px-3.5 py-2.5 text-[16px] focus:border-accent"
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

        <button type="submit" className={buttonClass("secondary")}>
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
                <MemberPhotoFrame photo={photos.get(row.id as string)} size={56} />
                <h2 className="mt-3 text-[1.2rem]">{(row.display_name as string) ?? "Someone"}</h2>
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
