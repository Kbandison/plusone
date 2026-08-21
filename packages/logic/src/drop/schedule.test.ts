import { describe, expect, it } from "vitest";

import { clockLabel, dropNightDate, localHour, nextDropIsToday } from "./schedule";

/** 20:00 in the member's own timezone (DROP.hourLocal). */
const HOUR = 20;
const at = (iso: string) => new Date(iso);

/**
 * The hour has been declared since Milestone 1 and read by nothing. A drop was
 * keyed on the local CALENDAR date, so it arrived whenever a member first
 * opened the app that day — "three a night" was three a day.
 */
describe("a night runs from the hour, not from midnight", () => {
  it("is still last night's drop before the hour", () => {
    // 19:00 in New York on the 21st.
    expect(dropNightDate(at("2026-08-21T23:00:00Z"), "America/New_York", HOUR)).toBe("2026-08-20");
  });

  it("is tonight's from the hour onwards", () => {
    // 20:01 in New York on the 21st.
    expect(dropNightDate(at("2026-08-22T00:01:00Z"), "America/New_York", HOUR)).toBe("2026-08-21");
  });

  it("holds across midnight, which is the whole point", () => {
    // 00:30 on the 22nd in New York is still the 21st's night.
    expect(dropNightDate(at("2026-08-22T04:30:00Z"), "America/New_York", HOUR)).toBe("2026-08-21");
  });

  /** Two members an ocean apart get their own evening, not ours. */
  it("is the member's own timezone", () => {
    const moment = at("2026-08-21T23:00:00Z");
    // 19:00 in New York — before the hour, so last night.
    expect(dropNightDate(moment, "America/New_York", HOUR)).toBe("2026-08-20");
    // 00:00 on the 22nd in London — after the 21st's hour, so the 21st.
    expect(dropNightDate(moment, "Europe/London", HOUR)).toBe("2026-08-21");
  });

  /** A month boundary is where naive date arithmetic goes wrong. */
  it("steps back over the end of a month", () => {
    expect(dropNightDate(at("2026-09-01T10:00:00Z"), "UTC", HOUR)).toBe("2026-08-31");
  });

  /** And a year one. */
  it("steps back over the end of a year", () => {
    expect(dropNightDate(at("2027-01-01T10:00:00Z"), "UTC", HOUR)).toBe("2026-12-31");
  });

  /** An unknown timezone must not cost somebody their drop. */
  it("falls back to UTC rather than throwing", () => {
    expect(dropNightDate(at("2026-08-21T23:00:00Z"), "Mars/Olympus", HOUR)).toBe("2026-08-21");
    expect(localHour(at("2026-08-21T23:00:00Z"), "Mars/Olympus")).toBe(23);
  });
});

/**
 * hour12: false renders midnight as "24" in some engines, which is a whole day
 * out on the one hour where it decides which night you are in.
 */
describe("midnight is hour zero", () => {
  it("reads 00:xx as 0, not 24", () => {
    expect(localHour(at("2026-08-21T00:30:00Z"), "UTC")).toBe(0);
  });

  it("puts midnight on the previous night", () => {
    expect(dropNightDate(at("2026-08-21T00:30:00Z"), "UTC", HOUR)).toBe("2026-08-20");
  });
});

describe("when the next one lands", () => {
  it("is tonight before the hour", () => {
    expect(nextDropIsToday(at("2026-08-21T10:00:00Z"), "UTC", HOUR)).toBe(true);
  });

  it("is tomorrow once tonight's has arrived", () => {
    expect(nextDropIsToday(at("2026-08-21T21:00:00Z"), "UTC", HOUR)).toBe(false);
  });

  /** On the hour itself the drop has landed, so the next is tomorrow's. */
  it("treats the hour itself as landed", () => {
    expect(nextDropIsToday(at("2026-08-21T20:00:00Z"), "UTC", HOUR)).toBe(false);
    expect(dropNightDate(at("2026-08-21T20:00:00Z"), "UTC", HOUR)).toBe("2026-08-21");
  });
});

describe("an hour as a member would say it", () => {
  it.each([
    [20, "8pm"],
    [0, "12am"],
    [12, "12pm"],
    [1, "1am"],
    [13, "1pm"],
    [23, "11pm"],
    [11, "11am"],
  ])("%i reads as %s", (hour, label) => {
    expect(clockLabel(hour)).toBe(label);
  });
});
