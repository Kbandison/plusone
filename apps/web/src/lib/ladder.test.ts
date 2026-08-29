import { describe, expect, it } from "vitest";

import { RADIUS } from "@plusone/config";

import { withStoredValue } from "./ladder";

/**
 * A `<select>` given a value none of its options carry silently selects the
 * first one — no error, no warning, and it looks fine. The control then shows a
 * value the member never chose and the next submit writes it.
 */
describe("a ladder can always state the value it holds", () => {
  it("adds a value the ladder does not carry", () => {
    expect(withStoredValue([50, 100, 150, 250], 110)).toEqual([50, 100, 110, 150, 250]);
  });

  /** Appending would render 5, 10, 25, 50, 100, 250, 110 — broken-looking. */
  it("sorts it into place rather than appending it", () => {
    const result = withStoredValue([50, 100, 150, 250], 110);
    expect(result).toEqual([...result].sort((a, b) => a - b));
  });

  it("changes nothing when the value is already on the ladder", () => {
    expect(withStoredValue([50, 100, 150, 250], 100)).toEqual([50, 100, 150, 250]);
  });

  it("changes nothing when there is no value", () => {
    expect(withStoredValue([50, 100, 150, 250], null)).toEqual([50, 100, 150, 250]);
    expect(withStoredValue([50, 100, 150, 250], undefined)).toEqual([50, 100, 150, 250]);
  });

  it("does not mutate the ladder it was given", () => {
    const ladder = [50, 100];
    withStoredValue(ladder, 75);
    expect(ladder).toEqual([50, 100]);
  });

  /** Below the floor and above the ceiling are still values a select must state. */
  it("states an out-of-range value rather than hiding it", () => {
    expect(withStoredValue([50, 100], 5)).toEqual([5, 50, 100]);
    expect(withStoredValue([50, 100], 400)).toEqual([50, 100, 400]);
  });

  /**
   * The default is what every member has before they touch anything, so a
   * default off the ladder hands a stray extra rung to all of them at once —
   * the widest possible version of this bug. macOS pinned the same property on
   * their alert ladder.
   */
  it("keeps the configured default on the offered ladder", () => {
    expect(RADIUS.ladderMi as readonly number[]).toContain(RADIUS.defaultMi);
  });
});
