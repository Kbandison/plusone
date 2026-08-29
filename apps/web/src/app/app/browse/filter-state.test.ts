import { describe, expect, it } from "vitest";

import { RADIUS } from "@plusone/config";

import {
  ACTIVITY_WINDOWS,
  AGE_CEILING,
  AGE_FLOOR,
  ARRAY_FILTER_PARAMS,
  ENUM_FILTERS,
  RANGE_FILTERS,
  activityDays,
  advancedFilterCount,
  isFiltered,
  parseBrowseFilters,
} from "./filter-state";

const parse = (params: Record<string, string>, ownRadius: number | null = 50) =>
  parseBrowseFilters(params, ownRadius);

/**
 * Every one of these is a hand-typable string reaching PostgREST. An enum column
 * given a junk value answers with an error, so the page would render as broken
 * rather than as unfiltered — which is the worse of the two failures, because a
 * member cannot tell it from the app being down.
 */
describe("nothing in the URL is trusted", () => {
  it("drops a value the vocabulary does not contain", () => {
    const state = parse({ smokes: "occasionally", kids: "maybe", intention: "marriage" });
    expect(state.enums.smokes).toBeUndefined();
    expect(state.enums.kids).toBeUndefined();
    expect(state.enums.intention).toBeUndefined();
  });

  /** A stale link naming a retired option keeps working, minus that option. */
  it("keeps the rest of a URL when one value is junk", () => {
    const state = parse({ smokes: "never", kids: "nonsense" });
    expect(state.enums.smokes).toBe("never");
    expect(state.enums.kids).toBeUndefined();
  });

  it("refuses an age outside the bounds, either end", () => {
    expect(parse({ age_min: "17" }).ranges.age).toBeUndefined();
    expect(parse({ age_min: "0" }).ranges.age).toBeUndefined();
    expect(parse({ age_max: "200" }).ranges.age).toBeUndefined();
    expect(parse({ age_min: String(AGE_FLOOR) }).ranges.age?.min).toBe(AGE_FLOOR);
    expect(parse({ age_max: String(AGE_CEILING) }).ranges.age?.max).toBe(AGE_CEILING);
  });

  it("refuses a fractional or non-numeric age rather than rounding one", () => {
    expect(parse({ age_min: "24.5" }).ranges.age).toBeUndefined();
    expect(parse({ age_min: "twenty" }).ranges.age).toBeUndefined();
    expect(parse({ age_min: "" }).ranges.age).toBeUndefined();
  });

  /**
   * Ends swapped match nobody, and an empty grid reads as a dead app rather
   * than as a typo. profiles_age_range_is_adult refuses the row outright; a URL
   * cannot be refused, so it is ignored.
   */
  it("ignores a range with the ends swapped rather than matching nobody", () => {
    const state = parse({ age_min: "50", age_max: "30" });
    expect(state.ranges.age).toBeUndefined();
    expect(advancedFilterCount(state)).toBe(0);
  });

  it("keeps a range whose ends are equal", () => {
    const state = parse({ age_min: "30", age_max: "30" });
    expect(state.ranges.age?.min).toBe(30);
    expect(state.ranges.age?.max).toBe(30);
  });
});

/**
 * The member's OWN radius is the default, not the maximum. It was
 * `Number(filters.distance) || RADIUS.maxMi`, so the last step of onboarding
 * decided nothing here.
 */
describe("the radius", () => {
  it("defaults to the member's own setting", () => {
    expect(parse({}, 25).distanceMi).toBe(25);
  });

  it("lets an explicit one win, because this is a default and not a ceiling", () => {
    expect(parse({ distance: "100" }, 25).distanceMi).toBe(100);
  });

  it("clamps a hand-typed radius to the configured bounds", () => {
    expect(parse({ distance: "99999" }).distanceMi).toBe(RADIUS.maxMi);
    expect(parse({ distance: "1" }).distanceMi).toBe(RADIUS.minMi);
  });

  it("falls back to the configured default when the member has no setting", () => {
    expect(parse({}, null).distanceMi).toBe(RADIUS.defaultMi);
  });
});

/**
 * The checkbox this ladder replaces is in whatever links members have already
 * sent each other. A URL that silently stops filtering is worse than one that
 * errors: the results still look plausible.
 */
describe("the activity ladder", () => {
  it("still honours the checkbox it replaced, as the middle rung", () => {
    expect(parse({ active: "1" }).activity).toBe("week");
  });

  it("lets the newer control win where a URL carries both", () => {
    expect(parse({ active: "1", activity: "day" }).activity).toBe("day");
  });

  it("is off when neither is present", () => {
    expect(parse({}).activity).toBeNull();
    expect(parse({ active: "0" }).activity).toBeNull();
  });

  it("gives every rung a window, and they ascend", () => {
    const days = ACTIVITY_WINDOWS.map((w) => activityDays(w.id));
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(new Set(days).size).toBe(days.length);
    expect(days.every((d) => d > 0)).toBe(true);
  });
});

/**
 * A default radius is not a filter. Clearing it would change nothing, and the
 * "clear filters" offer beside the empty state would be a lie.
 */
describe("whether the emptiness is the member's own doing", () => {
  it("is not filtered on a bare page", () => {
    expect(isFiltered(parse({}))).toBe(false);
    expect(advancedFilterCount(parse({}))).toBe(0);
  });

  it("is not filtered by a radius that only came from the member's own setting", () => {
    expect(isFiltered(parse({}, 250))).toBe(false);
  });

  /** Clearing it returns them to their own setting, so the offer is honest. */
  it("is filtered by an explicit radius", () => {
    expect(isFiltered(parse({ distance: "25" }))).toBe(true);
  });

  it("counts each of the folded eight, and only those", () => {
    // intention and the age range are the un-folded ones, so neither counts
    // toward the badge that decides whether the fold opens itself.
    expect(advancedFilterCount(parse({ intention: "casual", activity: "day" }))).toBe(0);
    expect(isFiltered(parse({ intention: "casual" }))).toBe(true);

    const all = parse({
      smokes: "never",
      drinks: "never",
      kids: "none",
      kids_plan: "want",
      height_min: "170",
      written: "1",
    });
    expect(advancedFilterCount(all)).toBe(6);
    expect(isFiltered(all)).toBe(true);
  });

  /** The fold must open itself, or a short page reads as a dead app. */
  it("counts a junk value as off, so the fold does not open on nothing", () => {
    expect(advancedFilterCount(parse({ smokes: "occasionally" }))).toBe(0);
  });

  it("treats the written checkbox as on only when it is the value the form writes", () => {
    expect(parse({ written: "1" }).writtenOnly).toBe(true);
    expect(parse({ written: "0" }).writtenOnly).toBe(false);
    expect(parse({ written: "true" }).writtenOnly).toBe(false);
  });
});

/**
 * The table is the contract now, so the things that were previously guaranteed
 * by writing each filter out by hand have to be asserted instead.
 */
describe("the filter table itself", () => {
  it("gives every filter a unique query parameter", () => {
    const params = [
      ...ENUM_FILTERS.map((f) => f.param),
      ...RANGE_FILTERS.flatMap((r) => [`${r.key}_min`, `${r.key}_max`]),
    ];
    expect(new Set(params).size).toBe(params.length);
  });

  /**
   * The one-word mistake with no error and no wrong-looking empty state.
   * `.eq()` against a text[] matches only somebody whose entire list is exactly
   * the value asked for, which for anybody bilingual is nobody.
   */
  it("names every array column, and only the array columns", () => {
    expect(ARRAY_FILTER_PARAMS).toEqual(["language"]);
    for (const param of ARRAY_FILTER_PARAMS) {
      expect(ENUM_FILTERS.some((f) => f.param === param)).toBe(true);
    }
  });

  /** A filter whose options are empty is a control offering only "Any". */
  it("gives every enum filter a non-empty vocabulary", () => {
    for (const filter of ENUM_FILTERS) {
      expect(Object.keys(filter.options).length, filter.param).toBeGreaterThan(1);
    }
  });

  it("keeps every range the right way round", () => {
    for (const range of RANGE_FILTERS) {
      expect(range.min, range.key).toBeLessThan(range.max);
    }
  });

  /**
   * Only four controls sit above the fold, and they are the ones that describe
   * a SEARCH rather than a person. Everything else is folded, because nineteen
   * controls above a two-column grid pushes every face off the screen.
   */
  it("keeps the unfolded set small", () => {
    const top = [
      ...ENUM_FILTERS.filter((f) => f.group === "top"),
      ...RANGE_FILTERS.filter((r) => r.group === "top"),
    ];
    expect(top.length).toBeLessThanOrEqual(2);
  });
});
