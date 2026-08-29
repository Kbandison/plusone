import { describe, expect, it } from "vitest";

import { RADIUS } from "@plusone/config";

import {
  ACTIVITY_WINDOWS,
  AGE_CEILING,
  AGE_FLOOR,
  activityDays,
  advancedFilterCount,
  isFiltered,
  parseBrowseFilters,
} from "./filter-state";

const VOCAB = {
  intentions: ["long_term", "open_to_either", "casual", "friends_support"],
  frequencies: ["never", "sometimes", "often"],
  kids: ["none", "have", "have_grown"],
  kidsPlans: ["want", "open", "no", "unsure"],
};

const parse = (params: Record<string, string>, ownRadius: number | null = 50) =>
  parseBrowseFilters(params, VOCAB, ownRadius);

/**
 * Every one of these is a hand-typable string reaching PostgREST. An enum column
 * given a junk value answers with an error, so the page would render as broken
 * rather than as unfiltered — which is the worse of the two failures, because a
 * member cannot tell it from the app being down.
 */
describe("nothing in the URL is trusted", () => {
  it("drops a value the vocabulary does not contain", () => {
    const state = parse({ smokes: "occasionally", kids: "maybe", intention: "marriage" });
    expect(state.smokes).toBeNull();
    expect(state.kids).toBeNull();
    expect(state.intention).toBeNull();
  });

  /** A stale link naming a retired option keeps working, minus that option. */
  it("keeps the rest of a URL when one value is junk", () => {
    const state = parse({ smokes: "never", kids: "nonsense" });
    expect(state.smokes).toBe("never");
    expect(state.kids).toBeNull();
  });

  it("refuses an age outside the bounds, either end", () => {
    expect(parse({ age_min: "17" }).ageMin).toBeNull();
    expect(parse({ age_min: "0" }).ageMin).toBeNull();
    expect(parse({ age_max: "200" }).ageMax).toBeNull();
    expect(parse({ age_min: String(AGE_FLOOR) }).ageMin).toBe(AGE_FLOOR);
    expect(parse({ age_max: String(AGE_CEILING) }).ageMax).toBe(AGE_CEILING);
  });

  it("refuses a fractional or non-numeric age rather than rounding one", () => {
    expect(parse({ age_min: "24.5" }).ageMin).toBeNull();
    expect(parse({ age_min: "twenty" }).ageMin).toBeNull();
    expect(parse({ age_min: "" }).ageMin).toBeNull();
  });

  /**
   * Ends swapped match nobody, and an empty grid reads as a dead app rather
   * than as a typo. profiles_age_range_is_adult refuses the row outright; a URL
   * cannot be refused, so it is ignored.
   */
  it("ignores a range with the ends swapped rather than matching nobody", () => {
    const state = parse({ age_min: "50", age_max: "30" });
    expect(state.ageMin).toBeNull();
    expect(state.ageMax).toBeNull();
    expect(advancedFilterCount(state)).toBe(0);
  });

  it("keeps a range whose ends are equal", () => {
    const state = parse({ age_min: "30", age_max: "30" });
    expect(state.ageMin).toBe(30);
    expect(state.ageMax).toBe(30);
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
    expect(advancedFilterCount(parse({ intention: "casual", activity: "day" }))).toBe(0);
    expect(isFiltered(parse({ intention: "casual" }))).toBe(true);

    const all = parse({
      smokes: "never",
      drinks: "never",
      kids: "none",
      kids_plan: "want",
      age_min: "25",
      age_max: "40",
      bio: "1",
    });
    expect(advancedFilterCount(all)).toBe(7);
    expect(isFiltered(all)).toBe(true);
  });

  /** The fold must open itself, or a short page reads as a dead app. */
  it("counts a junk value as off, so the fold does not open on nothing", () => {
    expect(advancedFilterCount(parse({ smokes: "occasionally" }))).toBe(0);
  });

  it("treats the bio checkbox as on only when it is the value the form writes", () => {
    expect(parse({ bio: "1" }).writtenOnly).toBe(true);
    expect(parse({ bio: "0" }).writtenOnly).toBe(false);
    expect(parse({ bio: "true" }).writtenOnly).toBe(false);
  });
});
