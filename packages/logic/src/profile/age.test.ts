import { describe, expect, it } from "vitest";

import { MINIMUM_AGE, ageOn, isAdult, isLeapYear, parseIsoDate } from "./index";

describe("parsing", () => {
  it("accepts a real date", () => {
    expect(parseIsoDate("1990-06-15")).toEqual({ year: 1990, month: 6, day: 15 });
  });

  // "2025-02-30" passes a regex and, with Date arithmetic, rolls silently into
  // March. Silently accepting a date nobody was born on is worse than refusing.
  it.each(["2025-02-30", "2025-13-01", "2025-00-10", "2025-04-31", "1999-02-29"])(
    "rejects the impossible date %s",
    (value) => {
      expect(parseIsoDate(value)).toBeNull();
    },
  );

  it.each(["", "15/06/1990", "1990-6-15", "not a date", "1990-06-15T00:00:00Z"])(
    "rejects the malformed date %s",
    (value) => {
      expect(parseIsoDate(value)).toBeNull();
    },
  );

  it("accepts 29 February in a leap year", () => {
    expect(parseIsoDate("2000-02-29")).not.toBeNull();
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2024)).toBe(true);
  });
});

describe("age", () => {
  it("counts whole years", () => {
    expect(ageOn("1990-06-15", "2026-06-15")).toBe(36);
  });

  it("does not count a birthday that has not happened yet", () => {
    expect(ageOn("1990-06-15", "2026-06-14")).toBe(35);
  });

  it("counts the birthday itself", () => {
    expect(ageOn("2008-08-14", "2026-08-14")).toBe(18);
  });

  it("handles a December birthday in January", () => {
    expect(ageOn("1990-12-31", "2026-01-01")).toBe(35);
  });

  it("returns null for an unparseable date", () => {
    expect(ageOn("nonsense", "2026-08-14")).toBeNull();
    expect(ageOn("1990-06-15", "nonsense")).toBeNull();
  });
});

describe("the 18+ rule", () => {
  it("admits someone on their eighteenth birthday, not before", () => {
    expect(isAdult("2008-08-14", "2026-08-14")).toBe(true);
    expect(isAdult("2008-08-15", "2026-08-14")).toBe(false);
  });

  it("agrees with MINIMUM_AGE", () => {
    expect(MINIMUM_AGE).toBe(18);
  });

  // A 29 February birthday has no anniversary in a common year. Treating 1
  // March as the day it lands falls out of the comparison rather than needing a
  // special case — but it is worth pinning, because getting it wrong makes
  // somebody a minor for a day.
  it("turns a leap-day baby 18 on 1 March in a common year", () => {
    expect(isAdult("2008-02-29", "2026-02-28")).toBe(false);
    expect(isAdult("2008-02-29", "2026-03-01")).toBe(true);
  });

  // A leap-day baby can never turn 18 ON a leap day: 18 is not a multiple of
  // four, so the eighteenth anniversary always lands in a common year. Their
  // birthday does return on later leap days, at ages 20, 24, and so on.
  it("counts a leap-day baby correctly on a later leap day", () => {
    expect(ageOn("2004-02-29", "2024-02-29")).toBe(20);
    expect(isAdult("2004-02-29", "2024-02-29")).toBe(true);
  });

  it("rejects a 29 February in a year that had no 29 February", () => {
    expect(parseIsoDate("2006-02-29")).toBeNull();
    expect(isAdult("2006-02-29", "2026-08-14")).toBe(false);
  });

  it("rejects an impossible date rather than guessing", () => {
    expect(isAdult("2000-02-30", "2026-08-14")).toBe(false);
  });
});
