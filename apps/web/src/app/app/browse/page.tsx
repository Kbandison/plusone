import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  COPY,
  DRAFT_COPY,
  FREQUENCY_LABELS,
  INTENTION_LABELS,
  KIDS_LABELS,
  KIDS_PLAN_LABELS,
  promptQuestion,
  type Intention,
  type ProfilePromptAnswer,
} from "@plusone/config";
import { connects as connectsLogic } from "@plusone/logic";

import { photosFor } from "@/lib/photo-urls";
import { compatibilityFor } from "@/lib/drop";
import { getServerSupabase } from "@/lib/supabase";
import { MemberPhotoFrame } from "../member-photo";
import { MemberTraitChips } from "../member-traits";
import { Badge } from "@/app/ui";
import { BrowseFilters } from "./browse-filters";
import {
  activityDays,
  advancedFilterCount,
  isFiltered,
  parseBrowseFilters,
  type BrowseSearchParams,
} from "./filter-state";

export const metadata: Metadata = { title: DRAFT_COPY.app.navBrowse };

const C = DRAFT_COPY.app;
const DAY = 24 * 60 * 60 * 1000;
/** As many as one screen of browsing is worth fetching. Also a promise the page has to keep. */
const LIMIT = 60;

/**
 * Browse (§7.2) — the secondary directory.
 *
 * Reads `matched_profiles`, so every wall applies before a row exists. The
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
  searchParams: Promise<BrowseSearchParams>;
}) {
  const params = await searchParams;

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

  const { data: me } = await supabase.rpc("my_profile").maybeSingle<{
    mode: string | null;
    search_radius_mi: number | null;
    intention: string | null;
  }>();
  if (me?.mode === "support_only") redirect("/app");

  // One parse, in one module, shared with the form that wrote the URL. The
  // parameter names were spelled out in both files and a rename in one produced
  // a control that silently stopped doing anything.
  const filters = parseBrowseFilters(
    params,
    {
      intentions: Object.keys(INTENTION_LABELS),
      frequencies: Object.keys(FREQUENCY_LABELS),
      kids: Object.keys(KIDS_LABELS),
      kidsPlans: Object.keys(KIDS_PLAN_LABELS),
    },
    me?.search_radius_mi ?? null,
  );
  const distanceMi = filters.distanceMi;

  // One instant for the filter, the stat and the card marker. Separate
  // `Date.now()` calls are separate moments a few milliseconds apart, which is
  // how a card says "active this week" on a page whose count did not include
  // it. It was one boundary because there was one window; there are now four,
  // and they all come off this.
  // eslint-disable-next-line react-hooks/purity -- Server Component: one render per request, on the server. The rule models a client re-render, which this has none of.
  const now = Date.now();
  const since = (days: number) => new Date(now - days * DAY).toISOString();
  /** The stat and the card marker, both of which describe a week whatever the filter asks. */
  const weekAgo = since(7);

  let query = supabase
    // matched_profiles, not visible_profiles: the same gender, seeking and age
    // rule the Drop obeys. Reading the wider view meant a member seeking women
    // saw every man in range one tab away from a Drop that had excluded them.
    .from("matched_profiles")
    // `prompts` comes through from visible_profiles, which matched_profiles
    // selects wholesale. It is the one thing on a card that is something the
    // person SAID rather than another measurement of them — and, per Decision
    // #14, the thing the next screen will ask you to reply to.
    //
    // The four lifestyle columns have been in this view since 20260818000100
    // and were selected by nothing. Every member answers them in onboarding.
    .select(
      "id, display_name, age, intention, distance_mi, last_active_at, prompts, smokes, drinks, kids, kids_plan",
    )
    .lte("distance_mi", distanceMi)
    .order("last_active_at", { ascending: false })
    .limit(LIMIT);

  if (filters.intention) query = query.eq("intention", filters.intention);
  if (filters.activity) query = query.gte("last_active_at", since(activityDays(filters.activity)));

  // The four that were already there. Equality against an enum column, so an
  // unrecognised value would be an error rather than an empty result — which is
  // why parseBrowseFilters drops anything it does not know instead of passing
  // it through.
  if (filters.smokes) query = query.eq("smokes", filters.smokes);
  if (filters.drinks) query = query.eq("drinks", filters.drinks);
  if (filters.kids) query = query.eq("kids", filters.kids);
  if (filters.kidsPlan) query = query.eq("kids_plan", filters.kidsPlan);

  // Narrows what the mutual age wall in matched_profiles already permitted. It
  // cannot widen it: both sides had to be inside the other's stated range
  // before a row existed at all.
  if (filters.ageMin != null) query = query.gte("age", filters.ageMin);
  if (filters.ageMax != null) query = query.lte("age", filters.ageMax);

  // A profile with a photograph and nothing else is the hardest kind to answer,
  // and Decision #14 makes a connect a reply to something they wrote.
  //
  // Bio only. "Has answered a prompt" is the better question and cannot be
  // asked from here — `prompts` is jsonb and PostgREST has no length predicate
  // for it, so it wants a computed column on the view. Shipping a filter that
  // approximates it with `neq('prompts', '[]')` would pass a profile holding
  // one prompt with an empty answer.
  if (filters.writtenOnly) query = query.not("bio", "is", null);

  const { data } = await query;
  const rows = data ?? [];

  const ids = rows.map((row) => row.id as string);
  const [photos, compatibility] = await Promise.all([
    photosFor(ids),
    /**
     * The same number the Drop puts on the same person.
     *
     * It was on one surface and not the other: the Drop said "78% compatible"
     * and the directory one tab away said nothing, about the same member, on
     * the same evening. One function rather than a second implementation, so
     * the two cannot drift apart.
     */
    compatibilityFor(auth.user.id, (me?.intention as string | null) ?? "open_to_either", ids),
  ]);

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
   * Deliberately not narrowed by ANY of the filters. The sentence says how many
   * people are near you, which is a fact about the area rather than about the
   * current search — an "N people active" line that drops when you pick a
   * filter is describing the filter. That mattered when there were three
   * filters and matters more now there are eleven.
   */
  const { count: activeNearby } = await supabase
    .from("matched_profiles")
    .select("id", { count: "exact", head: true })
    .lte("distance_mi", distanceMi)
    .gte("last_active_at", weekAgo);

  const activeThisWeek = activeNearby ?? 0;

  const advanced = advancedFilterCount(filters);
  const filtered = isFiltered(filters);

  return (
    <main id="main">
      <h1 className="text-h2">{C.navBrowse}</h1>

      {/* §3.4, verbatim — real counts only, never inflated. */}
      <p className="mt-4 text-[12.2px] text-ink-2">
        {COPY.browse.activityStat(activeThisWeek, distanceMi)}
      </p>

      <BrowseFilters state={filters} advancedCount={advanced} />

      {rows.length === 0 ? (
        <div className="mt-10">
          <p className="text-[13px] text-ink-2">{C.browseEmpty}</p>
          {/* The way out, on the screen that caused it. "Nobody matches those
              filters" with the filters sitting right above it and no way to
              undo them in one press is a dead end describing itself. */}
          {filtered ? (
            <Link
              href="/app/browse"
              className="ease-brand mt-4 inline-block text-[12.2px] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
            >
              {C.browseClearFilters}
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          {/* How many, and whether that is all of them. The grid ended at sixty
              with no sign there were more, and with no count at all a short
              list read as a broken page rather than as a thin evening. */}
          <p className="mt-6 text-[11px] text-ink-3">
            {C.browseCount(rows.length)}
            {rows.length === LIMIT ? ` · ${C.browseTruncated(LIMIT)}` : ""}
          </p>

          {/* Two columns on every width, and the photograph leads.
              It was a 56px circle beside a name — the shape of a search result,
              on the surface whose whole job is showing people to each other.
              The Drop settled this argument already; this is the same card at
              directory density. */}
          <ul className="mt-4 grid grid-cols-2 gap-4">
            {rows.map((row) => {
              const id = row.id as string;
              const photo = photos.get(id);
              const percent = compatibility.get(id);
              const meta = [row.age, row.distance_mi != null ? `${row.distance_mi} mi` : null]
                .filter(Boolean)
                .join(" · ");
              // The first one they answered. A card has room for one, and which
              // one is their choice of order rather than ours.
              const prompt = ((row.prompts ?? []) as ProfilePromptAnswer[]).find((entry) =>
                entry.answer?.trim(),
              );

              return (
                <li key={id} className="overflow-hidden rounded-xl border border-line-2 bg-surface">
                  <Link href={`/app/connect/${id}?source=browse`} className="block">
                    <div className="relative">
                      <MemberPhotoFrame photo={photo} fill className="aspect-[4/5] w-full" />

                      {/* Over the photograph, where the Drop puts it. */}
                      {percent != null ? (
                        <Badge className="absolute top-2 right-2">
                          {C.compatibilityLabel(percent)}
                        </Badge>
                      ) : null}

                      {/* The list is ordered by this and nothing said so, which
                          makes the order read as arbitrary. Coarse on purpose:
                          "active 3h ago" is a precision nobody asked to
                          broadcast, and this is the bucket the filter uses. */}
                      {(row.last_active_at as string) >= weekAgo ? (
                        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-ground/90 px-2 py-1 text-[10.5px] text-ink-2 backdrop-blur">
                          <span aria-hidden="true" className="size-1.5 rounded-full bg-positive" />
                          {C.browseActiveThisWeek}
                        </span>
                      ) : null}
                    </div>

                    <div className="p-4">
                      <h2 className="truncate text-[0.972rem]">
                        {(row.display_name as string) ?? C.threadUnknownPerson}
                      </h2>
                      {meta ? <p className="mt-1 text-[11.3px] text-ink-3">{meta}</p> : null}

                      {row.intention ? (
                        <p className="mt-2 text-[11.7px] leading-[1.5] text-ink-2">
                          {INTENTION_LABELS[row.intention as Intention]}
                        </p>
                      ) : null}

                      {/* Two of the four, because this grid is two columns at
                          every width and four chips wrap to three lines here,
                          which pushes the prompt off the bottom of the card.
                          The connect panel one tap away shows all of them. */}
                      <MemberTraitChips member={row} max={2} className="mt-2" />

                      {/* Something they said, not another measurement of them.
                          Decision #14 makes a connect a reply to a prompt, so
                          this is also what the sheet that opens next will ask
                          about — a directory that shows you people without
                          showing you the thing you would reply to is a
                          directory of faces.

                          Clamped rather than truncated in the query: three
                          lines is what a card of this width can hold, and the
                          full answer is one press away on the connect sheet. */}
                      {prompt ? (
                        <figure className="mt-3 border-l-2 border-line-2 pl-3">
                          <figcaption className="line-clamp-1 text-[10px] tracking-[0.02em] text-ink-3 uppercase">
                            {promptQuestion(prompt.id)}
                          </figcaption>
                          <blockquote className="mt-1 line-clamp-3 text-[11.7px] leading-[1.45] text-ink">
                            {prompt.answer}
                          </blockquote>
                        </figure>
                      ) : null}

                      {/* Why the picture is soft. Browse has rendered blurred
                          photos since it existed and never once said why —
                          which reads as a broken image rather than as somebody
                          else's setting. The Drop says it. */}
                      {photo?.isBlurred ? (
                        <p className="mt-2 text-[10.5px] leading-[1.45] text-ink-3">
                          {C.photoBlurredNote}
                        </p>
                      ) : null}

                      {history.get(id) ? (
                        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line-2 bg-ground px-2.5 py-1 text-[10.5px] text-ink-2">
                          <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
                          {HISTORY_LABEL[history.get(id)!]}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
