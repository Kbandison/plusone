import { describe, expect, it } from "vitest";

import { configNumber } from "./config-coerce";

const FALLBACK = 42;

describe("reading a number from config", () => {
  it("takes a number", () => {
    expect(configNumber({ k: 7 }, "k", FALLBACK)).toBe(7);
    expect(configNumber({ k: 0 }, "k", FALLBACK)).toBe(0);
    expect(configNumber({ k: -3 }, "k", FALLBACK)).toBe(-3);
    expect(configNumber({ k: 0.4 }, "k", FALLBACK)).toBe(0.4);
  });

  // jsonb round-trips as a string through some clients and a number through
  // others, so both have to work.
  it("takes a numeric string", () => {
    expect(configNumber({ k: "7" }, "k", FALLBACK)).toBe(7);
    expect(configNumber({ k: " 0.4 " }, "k", FALLBACK)).toBe(0.4);
    expect(configNumber({ k: "-3" }, "k", FALLBACK)).toBe(-3);
  });

  it("falls back when the key is missing", () => {
    expect(configNumber({}, "k", FALLBACK)).toBe(FALLBACK);
  });

  // Number(null) is 0, Number([]) is 0, Number(true) is 1. A missing radius
  // silently becoming zero is worse than a missing radius.
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["true", true],
    ["false", false],
    ["an empty array", []],
    ["an array", [1, 2]],
    ["an object", { a: 1 }],
    ["an empty string", ""],
    ["whitespace", "   "],
    ["a word", "lots"],
    ["a mixed string", "12px"],
  ])("falls back on %s rather than coercing it", (_label, value) => {
    expect(configNumber({ k: value }, "k", FALLBACK)).toBe(FALLBACK);
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["the string NaN", "NaN"],
    ["the string Infinity", "Infinity"],
  ])("falls back on %s", (_label, value) => {
    expect(configNumber({ k: value }, "k", FALLBACK)).toBe(FALLBACK);
  });

  it("never returns something unusable", () => {
    const nasty = [null, undefined, true, [], {}, "", "x", Number.NaN, Infinity, -Infinity, 0, "0"];
    for (const value of nasty) {
      const result = configNumber({ k: value }, "k", FALLBACK);
      expect(Number.isFinite(result), String(value)).toBe(true);
    }
  });

  it("does not read a prototype property as config", () => {
    // `{}.constructor` is a function; a key named "constructor" must not
    // resolve to it and then coerce to something.
    expect(configNumber({}, "constructor", FALLBACK)).toBe(FALLBACK);
    expect(configNumber({}, "toString", FALLBACK)).toBe(FALLBACK);
  });
});
