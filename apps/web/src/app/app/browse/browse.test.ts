import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

/** Assertions read code, not the prose around it. */
const withoutComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

const page = withoutComments(read("./page.tsx"));
const filters = withoutComments(read("./browse-filters.tsx"));

/**
 * §3.4 calls this an honest stat, and it counted the rows on the page — which
 * the page caps at sixty. In any city with more than sixty matches it read
 * "60 people active this week" whatever the truth was, and with the active-only
 * filter on it read exactly the number of cards below it.
 */
describe("the activity stat counts people, not cards", () => {
  it("asks the database for the number instead of measuring the page", () => {
    expect(page).toMatch(/count: "exact", head: true/);
    expect(page).toMatch(/const activeThisWeek = activeNearby \?\? 0/);
    // The old spelling: .filter() over the fetched rows.
    expect(page).not.toMatch(/const activeThisWeek = rows\.filter/);
  });

  /**
   * The sentence says how many people are near you, which is a fact about the
   * area — a count that drops when you pick a filter is describing the filter.
   */
  it("describes the area rather than the current search", () => {
    const stat = page.slice(page.indexOf("const { count: activeNearby }"));
    const call = stat.slice(0, stat.indexOf(";"));
    expect(call).toMatch(/lte\("distance_mi", distanceMi\)/);
    expect(call).not.toMatch(/intention/);
  });

  /**
   * One boundary for the filter, the stat and the card marker. Three separate
   * Date.now() calls are three moments a few milliseconds apart, which is how a
   * card says "active this week" on a page whose count did not include it.
   */
  it("uses one instant for all three", () => {
    expect(page).toMatch(/const weekAgo = new Date\(Date\.now\(\) - 7 \* DAY\)\.toISOString\(\)/);
    expect(page.match(/Date\.now\(\) - 7 \* DAY/g) ?? []).toHaveLength(1);
  });
});

/**
 * The select only offers the ladder, so nothing a member can click needs this.
 * But ?distance= is a URL, a URL is typed by hand, and `.lte("distance_mi",
 * 99999)` is a whole country when RADIUS.maxMi exists to mean something.
 */
describe("a hand-typed radius cannot exceed the maximum", () => {
  it("clamps to the configured bounds", () => {
    expect(page).toMatch(/Math\.min\(RADIUS\.maxMi, Math\.max\(RADIUS\.minMi/);
  });

  /** Not a wall, and the page should not be the thing pretending it is one. */
  it("still reads the view that holds the walls", () => {
    expect(page).toMatch(/from\("matched_profiles"\)/);
    expect(page).not.toMatch(/from\("profiles"\)/);
  });
});

/**
 * A grid that ends is not the same as a grid that is finished. A member in a
 * dense city saw sixty cards and no way to know whether that was everybody.
 */
describe("the page says when it is showing a slice", () => {
  it("names the cap it just hit", () => {
    expect(page).toMatch(/const LIMIT = 60/);
    expect(page).toMatch(/\.limit\(LIMIT\)/);
    expect(page).toMatch(/rows\.length === LIMIT \?[\s\S]{0,120}browseTruncated\(LIMIT\)/);
  });
});

/**
 * The list is ordered by last activity and nothing on a card said so, which
 * makes the order read as arbitrary.
 */
describe("a card says whether they have been around", () => {
  it("marks the ones inside the same week the filter uses", () => {
    expect(page).toMatch(/last_active_at as string\) >= weekAgo/);
    expect(page).toMatch(/C\.browseActiveThisWeek/);
  });

  /** "Active 3h ago" is a precision nobody asked to broadcast. */
  it("says the bucket, never the hour", () => {
    expect(page).not.toMatch(/compactAge|toLocaleTimeString/);
  });
});

/**
 * The last control in the app that asked a member to confirm a choice they had
 * already made. The profile stopped doing it, and a filter is a weaker
 * commitment than a search radius.
 */
describe("filters apply themselves", () => {
  it("submits when any of the three changes", () => {
    expect(filters.match(/onChange=\{apply\}/g) ?? []).toHaveLength(3);
    expect(filters).toMatch(/const apply = \(\) => form\.current\?\.requestSubmit\(\)/);
  });

  /**
   * Still a GET form, so every result is a URL a member can bookmark or send —
   * and reimplementing the serialisation in JavaScript would be a second place
   * for the parameter names to live.
   */
  it("stays a plain GET form underneath", () => {
    expect(filters).toMatch(/method="get"/);
    expect(filters).not.toMatch(/useRouter|router\.(push|replace)/);
  });

  /** Without JavaScript the selects do nothing, so the button is the only way. */
  it("keeps a way through with no JavaScript", () => {
    expect(filters).toMatch(/<noscript>[\s\S]{0,200}applyFiltersLabel/);
  });

  it("leaves no second Apply on the page", () => {
    expect(page).not.toMatch(/applyFiltersLabel/);
  });
});

/** Every string on this page comes from the copy file. */
describe("the page has no words of its own", () => {
  it("names an unknown member from copy rather than a literal", () => {
    expect(page).toMatch(/C\.threadUnknownPerson/);
    expect(page).not.toMatch(/"Someone"/);
  });
});
