import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { COPY, DRAFT_COPY, INTENTION_LABELS, RADIUS, type Intention } from "@plusone/config";
import { connects as connectsLogic } from "@plusone/logic";

import { photosFor } from "@/lib/photo-urls";
import { getServerSupabase } from "@/lib/supabase";
import { MemberPhotoFrame } from "../member-photo";
import { BrowseFilters } from "./browse-filters";

export const metadata: Metadata = { title: DRAFT_COPY.app.navBrowse };

const C = DRAFT_COPY.app;
const DAY = 24 * 60 * 60 * 1000;
/** As many as one screen of browsing is worth fetching. Also a promise the page has to keep. */
const LIMIT = 60;

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
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");
  const viewer = auth.user.id;

  const { data: me } = await supabase
    .rpc("my_profile")
    .maybeSingle<{ mode: string | null; search_radius_mi: number | null }>();
  if (me?.mode === "support_only") redirect("/app");

  // The member's OWN radius is the default, not the maximum.
  //
  // It was `Number(filters.distance) || RADIUS.maxMi` — two hundred and fifty
  // miles — so the last step of onboarding decided nothing here until a member
  // found this filter and set the same number a second time. An explicit
  // ?distance= still wins: this is a default, not a ceiling.
  //
  // Clamped, because ?distance= is a URL and a URL is typed by hand. The select
  // only offers the ladder, so nothing a member can click needs this — but
  // `.lte("distance_mi", 99999)` is a whole country, and RADIUS.maxMi exists to
  // mean something. Not a wall: matched_profiles holds every one of those, and
  // widening a radius cannot reach anybody it excluded.
  const asked = Number(filters.distance) || me?.search_radius_mi || RADIUS.defaultMi;
  const distanceMi = Math.min(RADIUS.maxMi, Math.max(RADIUS.minMi, Math.round(asked)));

  // One boundary for the filter, the stat and the card marker. Three separate
  // `Date.now() - 7 * DAY` calls would be three moments a few milliseconds
  // apart, which is how a card says "active this week" on a page whose count
  // did not include it.
  const weekAgo = new Date(Date.now() - 7 * DAY).toISOString();

  let query = supabase
    // matched_profiles, not visible_profiles: the same gender, seeking and age
    // rule the Drop obeys. Reading the wider view meant a member seeking women
    // saw every man in range one tab away from a Drop that had excluded them.
    .from("matched_profiles")
    .select("id, display_name, age, intention, distance_mi, last_active_at")
    .lte("distance_mi", distanceMi)
    .order("last_active_at", { ascending: false })
    .limit(LIMIT);

  if (intention && intention in INTENTION_LABELS) query = query.eq("intention", intention);
  if (activeOnly) query = query.gte("last_active_at", weekAgo);

  const { data } = await query;
  const rows = data ?? [];

  const photos = await photosFor(rows.map((row) => row.id as string));

  // What you already have with each of them.
  //
  // Browse had no memory at all: a member mid-conversation with you sat in the
  // grid looking exactly like a stranger, and the only thing that said
  // otherwise was the connect screen behind the card — after you had tapped
  // through to it and, on a Drop card, after you had decided to.
  //
  // One query for the whole page rather than one per row. RLS already limits
  // this to the viewer's own connects; the filter says which end they are.
  const { data: myConnects } = await supabase
    .from("connects")
    .select("initiator_id, target_id, status")
    .or(`initiator_id.eq.${viewer},target_id.eq.${viewer}`);

  const history = new Map<string, ReturnType<typeof connectsLogic.historyWith>>();
  for (const row of myConnects ?? []) {
    const initiated = (row.initiator_id as string) === viewer;
    const them = initiated ? (row.target_id as string) : (row.initiator_id as string);
    const state = connectsLogic.historyWith(row.status as connectsLogic.ConnectStatus, initiated);
    // A member can have several connects with the same person over time. The
    // live one is what a card should say — "Connected before" on somebody who
    // is waiting on your answer right now is worse than saying nothing.
    if (state !== "past" || !history.has(them)) history.set(them, state);
  }

  const HISTORY_LABEL: Record<string, string> = {
    waiting_on_you: C.threadNeedsDecision,
    waiting_on_them: C.threadSentWaiting,
    talking: C.browseTalking,
    past: C.browsePast,
  };

  /**
   * The honest count (§3.4), which this was not.
   *
   * It counted the rows on the page — and the page asks for sixty. In any city
   * with more than sixty matches the stat read "60 people active this week"
   * whatever the truth was, and with the active-only filter on it read exactly
   * the number of cards below it, which is not a statistic at all.
   *
   * A count query rather than a longer fetch: the number is the only thing
   * wanted, head:true sends no rows back for it, and the alternative is pulling
   * every matching profile in the radius to call .length on them.
   *
   * Deliberately not narrowed by the intention filter. The sentence says how
   * many people are near you, which is a fact about the area rather than about
   * the current search — an "N people active" line that drops when you pick a
   * filter is describing the filter.
   */
  const { count: activeNearby } = await supabase
    .from("matched_profiles")
    .select("id", { count: "exact", head: true })
    .lte("distance_mi", distanceMi)
    .gte("last_active_at", weekAgo);

  const activeThisWeek = activeNearby ?? 0;

  return (
    <main id="main">
      <h1 className="text-h2">{C.navBrowse}</h1>

      {/* §3.4, verbatim — real counts only, never inflated. */}
      <p className="mt-4 text-[12.2px] text-ink-2">
        {COPY.browse.activityStat(activeThisWeek, distanceMi)}
      </p>

      <BrowseFilters distanceMi={distanceMi} intention={intention} activeOnly={activeOnly} />

      {rows.length === LIMIT ? (
        <p className="mt-6 text-[11px] text-ink-3">{C.browseTruncated(LIMIT)}</p>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-10 text-[13px] text-ink-2">{C.browseEmpty}</p>
      ) : (
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {rows.map((row) => (
            <li key={row.id as string} className="rounded-xl border border-line-2 bg-surface p-5">
              <Link href={`/app/connect/${row.id as string}?source=browse`} className="block">
                <MemberPhotoFrame photo={photos.get(row.id as string)} size={56} />
                <h2 className="mt-3 text-[0.972rem]">
                  {(row.display_name as string) ?? C.threadUnknownPerson}
                </h2>
                <p className="mt-1.5 text-[11.3px] text-ink-3">
                  {[row.age, row.distance_mi != null ? `${row.distance_mi} mi` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {/* The list is ordered by this and nothing said so, which
                    makes the order read as arbitrary. Coarse on purpose:
                    "active 3h ago" is a precision nobody asked to broadcast,
                    and this is the same bucket as the filter above. */}
                {(row.last_active_at as string) >= weekAgo ? (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-3">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-positive" />
                    {C.browseActiveThisWeek}
                  </p>
                ) : null}

                {row.intention ? (
                  <p className="mt-3 text-[11.7px] text-ink-2">
                    {INTENTION_LABELS[row.intention as Intention]}
                  </p>
                ) : null}

                {history.get(row.id as string) ? (
                  <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-line-2 bg-ground px-3 py-1 text-[11px] text-ink-2">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
                    {HISTORY_LABEL[history.get(row.id as string)!]}
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
