import {
  DIET_LABELS,
  DRAFT_COPY,
  DRINKING_TRAIT_LABELS,
  EDUCATION_LABELS,
  EXERCISE_TRAIT_LABELS,
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  INTENTION_LABELS,
  KIDS_LABELS,
  KIDS_PLAN_LABELS,
  LANGUAGE_LABELS,
  PETS_LABELS,
  POLITICS_LABELS,
  RADIUS,
  RELATIONSHIP_STRUCTURE_LABELS,
  RELIGION_LABELS,
  SMOKING_TRAIT_LABELS,
  WEIGHT_MAX_KG,
  WEIGHT_MIN_KG,
  WORK_LABELS,
} from "@plusone/config";

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
 * ── why this is a table rather than a list of fields ────────────────────────
 *
 * It started as one named field per filter, which was fine at three and honest
 * at eleven. It is nineteen now, and fourteen of those are the identical shape:
 * a query parameter, a column, and a vocabulary the value has to belong to.
 * Written out one by one that is fourteen chances to validate against the wrong
 * map, and the symptom of getting it wrong is not an error — it is a filter
 * that silently matches nobody, on a surface where matching nobody is a
 * plausible result.
 *
 * So the shape is declared once and the parser, the query and the form all read
 * the same table. Adding a filter is a row.
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

const C = DRAFT_COPY.app;

/**
 * The one-of-an-enum filters, in the order they are drawn.
 *
 * `column` is the column on `matched_profiles`, and it is stated rather than
 * derived from `param` because the two genuinely differ once — `kids_plan` is
 * the column and `kids_plan` the parameter, but the day one of them needs to
 * change for a URL that is already in circulation, deriving would make that
 * impossible without breaking links.
 *
 * `group` decides which fieldset it lands in. Nineteen controls in one flat row
 * is a wall, and a wall invites a member to narrow a thin pool to nothing
 * before they have seen anybody.
 */
export const ENUM_FILTERS = [
  {
    param: "intention",
    column: "intention",
    label: C.filterIntention,
    options: INTENTION_LABELS,
    group: "top",
  },
  { param: "kids", column: "kids", label: C.filterKids, options: KIDS_LABELS, group: "life" },
  {
    param: "kids_plan",
    column: "kids_plan",
    label: C.filterKidsPlan,
    options: KIDS_PLAN_LABELS,
    group: "life",
  },
  {
    param: "relationship",
    column: "relationship_structure",
    label: C.filterRelationship,
    options: RELATIONSHIP_STRUCTURE_LABELS,
    group: "life",
  },
  {
    param: "smokes",
    column: "smokes",
    label: C.filterSmokes,
    options: SMOKING_TRAIT_LABELS,
    group: "habits",
  },
  {
    param: "drinks",
    column: "drinks",
    label: C.filterDrinks,
    options: DRINKING_TRAIT_LABELS,
    group: "habits",
  },
  {
    param: "exercise",
    column: "exercise",
    label: C.filterExercise,
    options: EXERCISE_TRAIT_LABELS,
    group: "habits",
  },
  { param: "diet", column: "diet", label: C.filterDiet, options: DIET_LABELS, group: "habits" },
  { param: "pets", column: "pets", label: C.filterPets, options: PETS_LABELS, group: "habits" },
  {
    param: "education",
    column: "education",
    label: C.filterEducation,
    options: EDUCATION_LABELS,
    group: "background",
  },
  { param: "work", column: "work", label: C.filterWork, options: WORK_LABELS, group: "background" },
  {
    param: "language",
    column: "languages",
    label: C.filterLanguage,
    options: LANGUAGE_LABELS,
    group: "background",
  },
  {
    param: "religion",
    column: "religion",
    label: C.filterReligion,
    options: RELIGION_LABELS,
    group: "belief",
  },
  {
    param: "politics",
    column: "politics",
    label: C.filterPolitics,
    options: POLITICS_LABELS,
    group: "belief",
  },
] as const;

export type EnumFilter = (typeof ENUM_FILTERS)[number];
export type EnumParam = EnumFilter["param"];

/**
 * `languages` is an ARRAY column and every other one here is scalar.
 *
 * Named rather than inferred, because the difference decides the operator —
 * `.eq()` against a text[] matches only somebody whose entire language list is
 * exactly the one asked for, which for anybody bilingual is nobody. It has to
 * be `.contains()`. That is a one-word mistake with no error and no empty
 * state that looks wrong.
 */
export const ARRAY_FILTER_PARAMS: readonly EnumParam[] = ["language"];

/** The numeric ranges: a parameter pair, a column, and the bounds a URL may not exceed. */
export const RANGE_FILTERS = [
  {
    key: "age",
    column: "age",
    min: AGE_FLOOR,
    max: AGE_CEILING,
    fromLabel: C.filterAgeFrom,
    toLabel: C.filterAgeTo,
    group: "top",
  },
  {
    key: "height",
    column: "height_cm",
    min: HEIGHT_MIN_CM,
    max: HEIGHT_MAX_CM,
    fromLabel: C.filterHeightFrom,
    toLabel: C.filterAgeTo,
    group: "body",
  },
  {
    key: "weight",
    column: "weight_kg",
    min: WEIGHT_MIN_KG,
    max: WEIGHT_MAX_KG,
    fromLabel: C.filterWeightFrom,
    toLabel: C.filterAgeTo,
    group: "body",
  },
] as const;

export type RangeFilter = (typeof RANGE_FILTERS)[number];
export type RangeKey = RangeFilter["key"];

/**
 * Which filters Premium buys (server 18d).
 *
 * The four in the "top" group are free: distance, what they are looking for,
 * how recently they were active, and age. Those are what somebody opens Browse
 * to set, and Decision #23/#24 keeps the free tier genuinely usable — a member
 * who cannot narrow by distance does not have a directory, they have a list.
 *
 * Everything behind "More filters" is paid, which is exactly what
 * `PREMIUM_INCLUDES` has been promising on two public pages: "Advanced browse
 * filters". The line falls where the fold already was, so nothing moves.
 *
 * Kevin's call 2026-08-29, both halves — this split, and that a paid filter
 * APPEARS DISABLED rather than being absent, so a free member can see the shape
 * of the tier on the screen where they would use it.
 */
export const isPaidGroup = (group: string): boolean => group !== "top";

export type BrowseSearchParams = Partial<
  Record<
    | EnumParam
    | `${RangeKey}_min`
    | `${RangeKey}_max`
    | "distance"
    | "active"
    | "activity"
    | "written",
    string
  >
>;

export interface BrowseFilterState {
  distanceMi: number;
  distanceFromUrl: boolean;
  activity: ActivityWindow | null;
  /** param -> the chosen value, for every enum filter that is on. */
  enums: Partial<Record<EnumParam, string>>;
  /** key -> [min, max], either end nullable. */
  ranges: Partial<Record<RangeKey, { min: number | null; max: number | null }>>;
  writtenOnly: boolean;
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
const bounded = (value: string | undefined, min: number, max: number): number | null => {
  const n = Number(value);
  if (!Number.isInteger(n) || value === "" || value == null) return null;
  return n >= min && n <= max ? n : null;
};

export function parseBrowseFilters(
  params: BrowseSearchParams,
  ownRadiusMi: number | null,
  isPremium: boolean,
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
  const ladder = ACTIVITY_WINDOWS.find((w) => w.id === params.activity)?.id ?? null;
  const activity: ActivityWindow | null = ladder ?? (params.active === "1" ? "week" : null);

  // A paid filter in the URL is DROPPED for a non-premium member, not refused.
  //
  // This is the gate. Disabling the control is presentation — the URL is the
  // real input, it is typed by hand and bookmarked and shared, and a member
  // whose premium lapsed still has yesterday's filtered link. Dropping here
  // means the query, the match count and the rendered control all agree: the
  // select shows "Any" because the filter genuinely is not applied.
  //
  // Ignored rather than an error, which is the lapse rule and the mirror of
  // 18b's. The safe direction is the one that shows a member MORE people and
  // never makes the member themselves more visible. An error would strand
  // somebody on a bookmarked link; persisting would sell them something they
  // are no longer paying for.
  const enums: Partial<Record<EnumParam, string>> = {};
  for (const filter of ENUM_FILTERS) {
    if (!isPremium && isPaidGroup(filter.group)) continue;
    const raw = params[filter.param];
    if (raw != null && raw in filter.options) enums[filter.param] = raw;
  }

  const ranges: BrowseFilterState["ranges"] = {};
  for (const range of RANGE_FILTERS) {
    if (!isPremium && isPaidGroup(range.group)) continue;
    const min = bounded(params[`${range.key}_min`], range.min, range.max);
    const max = bounded(params[`${range.key}_max`], range.min, range.max);
    // Ends swapped match nobody, and an empty grid reads as a dead app rather
    // than as a typo. profiles_age_range_is_adult refuses the row outright; a
    // URL cannot be refused, so it is ignored.
    const swapped = min != null && max != null && min > max;
    if (!swapped && (min != null || max != null)) ranges[range.key] = { min, max };
  }

  return {
    distanceMi,
    distanceFromUrl: Boolean(params.distance),
    activity,
    enums,
    ranges,
    // Folded, so paid like the rest of the fold.
    writtenOnly: isPremium && params.written === "1",
  };
}

/** How many of the folded filters are on. Decides whether the fold opens itself. */
export function advancedFilterCount(state: BrowseFilterState): number {
  const folded = ENUM_FILTERS.filter((f) => f.group !== "top").filter(
    (f) => state.enums[f.param] != null,
  ).length;
  const ranged = RANGE_FILTERS.filter((r) => state.ranges[r.key] != null).length;
  return folded + ranged + (state.writtenOnly ? 1 : 0);
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
    state.activity != null ||
    Object.keys(state.enums).length > 0 ||
    advancedFilterCount(state) > 0
  );
}
