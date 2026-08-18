import { describe, expect, it } from "vitest";

import { MAX_PHOTOS, lowestFreeSlot } from "./photo-limits";

/**
 * Reported from the live site: delete a photo, add more, and only the first one
 * lands — every upload after it fails, well under the six-photo ceiling.
 *
 * The cause was `position: count`. Positions are a set with holes in it, not a
 * length, and nothing could make a hole until Remove existed.
 */
describe("which slot a new photo takes", () => {
  it("fills the first empty slot", () => {
    expect(lowestFreeSlot([])).toBe(0);
    expect(lowestFreeSlot([0])).toBe(1);
    expect(lowestFreeSlot([0, 1, 2])).toBe(3);
  });

  /** The exact case reported: three photos, the first one removed. */
  it("reuses the hole a deletion left, rather than colliding with a real row", () => {
    // Rows left are 1 and 2. `count` is 2 — which is taken.
    expect(lowestFreeSlot([1, 2])).toBe(0);
    expect(lowestFreeSlot([1, 2])).not.toBe([1, 2].length);
  });

  /**
   * `max + 1` fails differently and just as badly: with rows at 0 and 5 it
   * picks 6, and profiles_photos_position_range CHECKs 0..5.
   */
  it("stays inside the range when the hole is in the middle", () => {
    expect(lowestFreeSlot([0, 5])).toBe(1);
    expect(lowestFreeSlot([0, 1, 2, 3, 4])).toBe(5);
  });

  it("says there is no slot when every one is taken", () => {
    expect(lowestFreeSlot([0, 1, 2, 3, 4, 5])).toBeNull();
  });

  /** Duplicates and stray values must not shift the answer. */
  it("is not confused by repeats", () => {
    expect(lowestFreeSlot([0, 0, 1, 1])).toBe(2);
  });

  it("agrees with the database ceiling", () => {
    const full = Array.from({ length: MAX_PHOTOS }, (_, i) => i);
    expect(lowestFreeSlot(full)).toBeNull();
    expect(lowestFreeSlot(full.slice(0, -1))).toBe(MAX_PHOTOS - 1);
  });
});
