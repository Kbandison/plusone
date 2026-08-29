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
    // Mattered when there were three filters and matters more now there are
    // eleven: the sentence is a fact about the area, so nothing the member
    // picked may narrow it.
    for (const param of ["intention", "smokes", "drinks", "kids", "age", "bio", "activity"]) {
      expect(call, `the stat narrowed by ${param}`).not.toMatch(new RegExp(param));
    }
  });

  /**
   * One boundary for the filter, the stat and the card marker. Three separate
   * Date.now() calls are three moments a few milliseconds apart, which is how a
   * card says "active this week" on a page whose count did not include it.
   */
  it("uses one instant for all of them", () => {
    // Was one boundary because there was one window. The activity ladder made
    // four, and the property worth pinning is the one the old assertion was
    // reaching for: every window comes off a single reading of the clock.
    expect(page).toMatch(/const now = Date\.now\(\)/);
    expect(page).toMatch(/const since = \(days: number\) =>/);
    expect(page).toMatch(/const weekAgo = since\(7\)/);
    expect(page.match(/Date\.now\(\)/g) ?? []).toHaveLength(1);
  });
});

/**
 * The select only offers the ladder, so nothing a member can click needs this.
 * But ?distance= is a URL, a URL is typed by hand, and `.lte("distance_mi",
 * 99999)` is a whole country when RADIUS.maxMi exists to mean something.
 */
describe("a hand-typed radius cannot exceed the maximum", () => {
  it("clamps to the configured bounds", () => {
    // The clamp moved into filter-state.ts with the rest of the parsing, and is
    // tested there against both ends. What this file cares about is that the
    // page takes its radius from that parse and not from the URL directly.
    expect(page).toMatch(/const filters = parseBrowseFilters\(/);
    expect(page).toMatch(/const distanceMi = filters\.distanceMi/);
    expect(page).not.toMatch(/Number\(params\.distance\)/);
    const state = read("./filter-state.ts");
    expect(state).toMatch(/Math\.min\(RADIUS\.maxMi, Math\.max\(RADIUS\.minMi/);
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
  it("submits when any of them changes", () => {
    expect(filters).toMatch(/const apply = \(\) => form\.current\?\.requestSubmit\(\)/);
    // Not a fixed count any more — the set grew from three to eleven and will
    // grow again. What must hold is that every control wires the same handler,
    // so none of them is the one that silently needs an Apply press.
    const tags = [...filters.matchAll(/<(select|input|Choice)\b[\s\S]*?\/?>/g)].map((m) => m[0]);
    expect(tags.length).toBeGreaterThan(3);
    for (const tag of tags) {
      const name = /name="([a-z_]+)"/.exec(tag)?.[1] ?? tag.slice(0, 40);
      expect(tag, `${name} does not apply itself`).toMatch(/onChange=\{/);
    }
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

/**
 * It was a 56px circle beside a name — the shape of a search result, on the
 * surface whose whole job is showing people to each other. The Drop settled
 * that argument already; this is the same card at directory density.
 */
describe("the photograph leads", () => {
  it("fills the card rather than sitting beside the name", () => {
    expect(page).toMatch(
      /<MemberPhotoFrame photo=\{photo\} fill className="aspect-\[4\/5\] w-full" \/>/,
    );
    expect(page).not.toMatch(/size=\{56\}/);
  });

  it("keeps two columns at every width", () => {
    expect(page).toMatch(/grid grid-cols-2 gap-4/);
    expect(page).not.toMatch(/sm:grid-cols-2/);
  });
});

/**
 * The Drop said "78% compatible" and the directory one tab away said nothing,
 * about the same member, on the same evening.
 */
describe("Browse shows the number the Drop shows", () => {
  it("puts compatibility on the card", () => {
    expect(page).toMatch(/C\.compatibilityLabel\(percent\)/);
    expect(page).toMatch(/<Badge className="absolute top-2 right-2">/);
  });

  /** One function, so the two surfaces cannot drift apart. */
  it("reuses the Drop's calculation rather than repeating it", () => {
    expect(page).toMatch(/compatibilityFor\(auth\.user\.id/);
    expect(page).toMatch(/from "@\/lib\/drop"/);
    const drop = read("../../../lib/drop.ts");
    expect(drop).toMatch(/export async function compatibilityFor/);
  });

  /** A member with no intention has no honest number, and a card must not invent one. */
  it("shows nothing when there is no number", () => {
    expect(page).toMatch(/percent != null \?/);
  });
});

/**
 * Browse has rendered blurred photographs since it existed and never once said
 * why — which reads as a broken image rather than as somebody else's setting.
 */
describe("a soft photograph says why it is soft", () => {
  it("carries the note the Drop carries", () => {
    expect(page).toMatch(/photo\?\.isBlurred \?/);
    expect(page).toMatch(/C\.photoBlurredNote/);
  });
});

/**
 * "Nobody matches those filters" with the filters sitting right above it and no
 * way to undo them in one press is a dead end describing itself.
 */
describe("the empty state offers a way out of itself", () => {
  it("clears the filters, when filters are the reason", () => {
    expect(page).toMatch(/C\.browseClearFilters/);
    expect(page).toMatch(/href="\/app\/browse"/);
  });

  /**
   * A default radius is not a filter. Clearing it would change nothing, and the
   * offer would be a lie.
   */
  it("does not offer it when nothing is filtered", () => {
    // The condition moved into filter-state.ts when it grew past three terms;
    // it is unit-tested there against every filter rather than pinned as a
    // string here, which had already been a spelling test rather than a
    // behaviour one.
    expect(page).toMatch(/const filtered = isFiltered\(filters\)/);
    expect(page).toMatch(/\{filtered \? \(/);
  });

  /** With no count at all, a short list reads as a broken page. */
  it("says how many, and whether that is all of them", () => {
    expect(page).toMatch(/C\.browseCount\(rows\.length\)/);
    expect(page).toMatch(/rows\.length === LIMIT \? ` · \$\{C\.browseTruncated\(LIMIT\)\}`/);
  });
});

/**
 * Decision #14 makes a connect a reply to a prompt. Browse showed you people
 * without showing you the thing you would reply to — a directory of faces, one
 * press away from a screen asking you to answer something you had not read.
 */
describe("a card carries something they said", () => {
  it("reads the prompts through the view that holds the walls", () => {
    expect(page).toMatch(/last_active_at, prompts,/);
    expect(page).toMatch(/from\("matched_profiles"\)/);
  });

  /** Which one is their choice of order, not ours — and never an empty one. */
  it("takes the first they actually answered", () => {
    expect(page).toMatch(/\.find\(\(entry\) =>\s*\n?\s*entry\.answer\?\.trim\(\)/);
  });

  /** The question by id, so a reworded prompt does not strand old answers. */
  it("renders the question from config", () => {
    expect(page).toMatch(/promptQuestion\(prompt\.id\)/);
    expect(page).toMatch(/\{prompt\.answer\}/);
  });

  /**
   * Clamped rather than truncated in the query: three lines is what a card of
   * this width holds, and the full answer is one press away on the sheet.
   */
  it("clamps rather than cutting the stored answer", () => {
    expect(page).toMatch(/line-clamp-3/);
    expect(page).toMatch(/line-clamp-1/);
    expect(page).not.toMatch(/\.slice\(0, \d+\)\s*\+\s*"…"/);
  });
});
