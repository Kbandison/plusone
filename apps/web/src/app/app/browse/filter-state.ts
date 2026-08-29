import { DRAFT_COPY, RADIUS } from "@plusone/config";

/**
 * Every Browse filter, parsed once.
 *
 * The form serialises itself into the query string and the page reads it back,
 * so the parameter names are the contract between two files that never import
 * each other. They lived in both until this existed; renaming one and not the
 * other produces a control that silently stops doing anything, which is the
 * failure mode a filter is least likely to be caught in — the results still
 * look plausible.
 *
 * Pure, and no Supabase types, so the parsing can be tested without a database.
 */

/** 18 is the hard floor everywhere in this product; the column allows 120. */
export const AGE_FLOOR = 18;
export const AGE_CEILING = 99;

/**
 * The label is here rather than a key the form looks up.
 *
 * It was `copyKey: "filterActivityDay"` with the component doing
 * `C[window.copyKey]`, which works and is invisible to `copy-is-wired.test.ts`
 * — that suite scans source for the literal member access and exists because
 * three separate strings had been written and never wired to anything. A
 * dynamic lookup is exactly the shape it cannot see, so a rung deleted from
 * this list would leave its copy behind with nothing to notice.
 */
export const ACTIVITY_WINDOWS = [
  { id: "day", days: 1, label: DRAFT_COPY.app.filterActivityDay },
  { id: "week", days: 7, label: DRAFT_COPY.app.filterActivityWeek },
  { id: "month", days: 30, label: DRAFT_COPY.app.filterActivityMonth },
] as const;

export type ActivityWindow = (typeof ACTIVITY_WINDOWS)[number]["id"];

export function activityDays(id: ActivityWindow): number {
  return ACTIVITY_WINDOWS.find((w) => w.id === id)?.days ?? 7;
}

/** The raw query string, as Next hands it over. */
export interface BrowseSearchParams {
  distance?: string | undefined;
  intention?: string | undefined;
  /** Superseded by `activity`, still honoured — see parseBrowseFilters. */
  active?: string | undefined;
  activity?: string | undefined;
  smokes?: string | undefined;
  drinks?: string | undefined;
  kids?: string | undefined;
  kids_plan?: string | undefined;
  age_min?: string | undefined;
  age_max?: string | undefined;
  bio?: string | undefined;
}

export interface BrowseFilterState {
  distanceMi: number;
  intention: string | null;
  activity: ActivityWindow | null;
  smokes: string | null;
  drinks: string | null;
  kids: string | null;
  kidsPlan: string | null;
  ageMin: number | null;
  ageMax: number | null;
  writtenOnly: boolean;
  /** Whether the radius came from the URL rather than from the member's own setting. */
  distanceFromUrl: boolean;
}

/**
 * Nothing here trusts the URL.
 *
 * Every one of these is a hand-typable string, and an unrecognised value is
 * dropped rather than passed to PostgREST — an enum column given a junk string
 * answers with an error, and the page would render as broken rather than as
 * unfiltered. Dropping is also the kinder half of the same rule: a stale link
 * naming a retired option keeps working, minus the option that no longer
 * exists.
 */
const oneOf = (value: string | undefined, allowed: readonly string[]): string | null =>
  value != null && allowed.includes(value) ? value : null;

const age = (value: string | undefined): number | null => {
  const n = Number(value);
  if (!Number.isInteger(n)) return null;
  return n >= AGE_FLOOR && n <= AGE_CEILING ? n : null;
};

export function parseBrowseFilters(
  params: BrowseSearchParams,
  vocab: {
    intentions: readonly string[];
    frequencies: readonly string[];
    kids: readonly string[];
    kidsPlans: readonly string[];
  },
  ownRadiusMi: number | null,
): BrowseFilterState {
  // The member's OWN radius is the default, not the maximum. It was
  // `Number(filters.distance) || RADIUS.maxMi` — two hundred and fifty miles —
  // so the last step of onboarding decided nothing here until a member found
  // this filter and set the same number a second time. An explicit ?distance=
  // still wins: this is a default, not a ceiling.
  //
  // Clamped, because a URL is typed by hand and `.lte("distance_mi", 99999)` is
  // a whole country when RADIUS.maxMi exists to mean something.
  const asked = Number(params.distance) || ownRadiusMi || RADIUS.defaultMi;
  const distanceMi = Math.min(RADIUS.maxMi, Math.max(RADIUS.minMi, Math.round(asked)));

  // `?active=1` was the checkbox this ladder replaces, and it is in whatever
  // links members have already sent each other. It means the middle rung.
  // `activity` wins where both are present — the newer control is the one the
  // form actually writes.
  const ladder = oneOf(
    params.activity,
    ACTIVITY_WINDOWS.map((w) => w.id),
  ) as ActivityWindow | null;
  const activity: ActivityWindow | null = ladder ?? (params.active === "1" ? "week" : null);

  const ageMin = age(params.age_min);
  const ageMax = age(params.age_max);

  return {
    distanceMi,
    distanceFromUrl: Boolean(params.distance),
    intention: oneOf(params.intention, vocab.intentions),
    activity,
    smokes: oneOf(params.smokes, vocab.frequencies),
    drinks: oneOf(params.drinks, vocab.frequencies),
    kids: oneOf(params.kids, vocab.kids),
    kidsPlan: oneOf(params.kids_plan, vocab.kidsPlans),
    // Ends swapped match nobody, and an empty grid reads as a dead app rather
    // than as a typo. The same reasoning as profiles_age_range_is_adult, which
    // refuses the row outright — a URL cannot be refused, so it is ignored.
    ageMin: ageMin != null && ageMax != null && ageMin > ageMax ? null : ageMin,
    ageMax: ageMin != null && ageMax != null && ageMin > ageMax ? null : ageMax,
    writtenOnly: params.bio === "1",
  };
}

/** How many of the folded eight are on. Decides whether the fold opens itself. */
export function advancedFilterCount(state: BrowseFilterState): number {
  return [
    state.smokes,
    state.drinks,
    state.kids,
    state.kidsPlan,
    state.ageMin,
    state.ageMax,
    state.writtenOnly ? "bio" : null,
  ].filter((v) => v != null).length;
}

/**
 * Whether the emptiness is the member's own doing.
 *
 * A default radius is not a filter — clearing it would change nothing and the
 * "clear filters" offer beside the empty state would be a lie. An explicit
 * ?distance= is, because clearing it returns the member to their own setting.
 */
export function isFiltered(state: BrowseFilterState): boolean {
  return (
    state.distanceFromUrl ||
    state.intention != null ||
    state.activity != null ||
    advancedFilterCount(state) > 0
  );
}
