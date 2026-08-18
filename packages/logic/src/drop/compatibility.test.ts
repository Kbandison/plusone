import { describe, expect, it } from "vitest";

import { DROP } from "@plusone/config";

import {
  NEUTRAL_QUIZ_COMPAT,
  compatibility,
  compatibilityPercent,
  intentionCompat,
} from "./scoring";

const W = DROP.weights;
const person = (intention: string, quizVector: readonly number[] | null) =>
  ({ intention, quizVector }) as never;

/**
 * Decision #19 puts a compatibility percentage on the card. The ranking score
 * is the wrong number for it: it mixes in recencyActive and underexposure, and
 * neither says anything about these two people.
 */
describe("what a compatibility percentage may be built from", () => {
  it("ignores how recently anybody was active", () => {
    const a = person("long_term", [1, 0, 0]);
    const b = person("long_term", [1, 0, 0]);
    // Same pair, computed twice with nothing about them changed. The ranking
    // score would move with time and exposure; this must not.
    expect(compatibility(a, b, W)).toBe(compatibility(a, b, W));
  });

  it("is symmetric, because compatibility is", () => {
    const a = person("casual", [0.4, -0.2, 0.9]);
    const b = person("long_term", [-0.1, 0.8, 0.3]);
    expect(compatibility(a, b, W)).toBeCloseTo(compatibility(b, a, W), 10);
  });

  it("stays inside nought and one", () => {
    for (const [x, y] of [
      [person("long_term", [1, 1, 1]), person("long_term", [1, 1, 1])],
      [person("friends_support", [-1, -1, -1]), person("casual", [1, 1, 1])],
      [person("casual", null), person("long_term", null)],
    ] as const) {
      const value = compatibility(x, y, W);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  /**
   * §7.2 makes the quiz skippable. A member who skipped it must not read as
   * incompatible with everybody — that would make it compulsory in all but
   * name, which is the same argument NEUTRAL_QUIZ_COMPAT exists for.
   */
  it("treats a skipped quiz as neutral rather than as zero", () => {
    const skipped = person("long_term", null);
    const answered = person("long_term", [1, 0, 0]);
    const both = compatibility(skipped, answered, W);

    const expected =
      (W.intentionCompat * intentionCompat("long_term", "long_term") +
        W.quizCompat * NEUTRAL_QUIZ_COMPAT) /
      (W.intentionCompat + W.quizCompat);
    expect(both).toBeCloseTo(expected, 10);
    expect(both).toBeGreaterThan(0.5);
  });

  /** Two people who agree on everything are the ceiling. */
  it("reaches the top only when both halves do", () => {
    const same = [0.5, 0.5, 0.5];
    expect(compatibility(person("long_term", same), person("long_term", same), W)).toBeCloseTo(
      1,
      6,
    );
  });

  /** §6.1: never a hard wall between dating intentions. */
  it("never returns zero for a pair of real intentions", () => {
    const worst = compatibility(
      person("friends_support", [1, 0, 0]),
      person("casual", [-1, 0, 0]),
      W,
    );
    expect(worst).toBeGreaterThan(0);
  });

  it("does not divide by zero if both weights are configured away", () => {
    const value = compatibility(person("casual", null), person("casual", null), {
      intentionCompat: 0,
      quizCompat: 0,
    });
    expect(Number.isFinite(value)).toBe(true);
  });
});

describe("the percentage a card shows", () => {
  it("is a whole number", () => {
    expect(compatibilityPercent(0.8234)).toBe(82);
    expect(compatibilityPercent(0.5)).toBe(50);
  });

  /** Never rounded up into a promise the score does not make. */
  it("cannot exceed a hundred or fall below nought", () => {
    expect(compatibilityPercent(1.4)).toBe(100);
    expect(compatibilityPercent(-2)).toBe(0);
    expect(compatibilityPercent(Number.NaN)).toBe(0);
  });
});
