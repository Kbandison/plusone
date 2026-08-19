import { describe, expect, it } from "vitest";

import {
  dateSeparatorLabel,
  messageTimeExact,
  messageTimeLabel,
  needsDateSeparator,
} from "./timestamps";

const at = (iso: string) => Date.parse(iso);

describe("messageTimeLabel", () => {
  it("gives the hour alone for a message sent today", () => {
    expect(messageTimeLabel(at("2026-08-19T09:41:00Z"), at("2026-08-19T18:00:00Z"))).toBe("09:41");
  });

  it("names yesterday rather than dating it", () => {
    expect(messageTimeLabel(at("2026-08-18T22:10:00Z"), at("2026-08-19T09:00:00Z"))).toBe(
      "Yesterday 22:10",
    );
  });

  /** "09:41" alone on a week-old message silently claims to be recent. */
  it("dates anything older", () => {
    expect(messageTimeLabel(at("2026-08-12T09:41:00Z"), at("2026-08-19T09:00:00Z"))).toBe(
      "12 Aug 09:41",
    );
  });

  it("adds a year only when it is a different one", () => {
    expect(messageTimeLabel(at("2025-12-30T09:41:00Z"), at("2026-08-19T09:00:00Z"))).toBe(
      "30 Dec 2025 09:41",
    );
  });

  /**
   * Yesterday is a calendar question, not an arithmetic one. 23:50 and 00:10
   * are twenty minutes apart and on different days; 00:10 and 23:50 the same
   * day are almost twenty-four hours apart and on the same one.
   */
  it("counts days by the calendar, not by elapsed hours", () => {
    expect(messageTimeLabel(at("2026-08-18T23:50:00Z"), at("2026-08-19T00:10:00Z"))).toBe(
      "Yesterday 23:50",
    );
    expect(messageTimeLabel(at("2026-08-19T00:10:00Z"), at("2026-08-19T23:50:00Z"))).toBe("00:10");
  });

  /** The member's clock, not the server's. */
  it("reads in the viewer's zone", () => {
    const sent = at("2026-08-19T02:30:00Z");
    expect(messageTimeLabel(sent, sent, "UTC")).toBe("02:30");
    expect(messageTimeLabel(sent, sent, "America/New_York")).toBe("22:30");
  });

  /**
   * That same message is YESTERDAY in New York and today in UTC. Getting this
   * wrong puts "Yesterday" on something a member watched arrive.
   */
  it("crosses the day boundary with the zone", () => {
    const sent = at("2026-08-19T02:30:00Z");
    const now = at("2026-08-19T14:00:00Z");
    expect(messageTimeLabel(sent, now, "UTC")).toBe("02:30");
    expect(messageTimeLabel(sent, now, "America/New_York")).toBe("Yesterday 22:30");
  });

  /**
   * A clock the caller supplies, never one this function reads. The same
   * message renders on the server and again on the client; Date.now() inside
   * here makes those two disagree and React calls it a hydration mismatch.
   */
  it("is a pure function of its arguments", () => {
    const sent = at("2026-08-19T09:41:00Z");
    const a = messageTimeLabel(sent, at("2026-08-19T10:00:00Z"));
    const b = messageTimeLabel(sent, at("2026-08-19T10:00:00Z"));
    expect(a).toBe(b);
  });
});

describe("messageTimeExact", () => {
  it("spells it out for the tooltip", () => {
    expect(messageTimeExact(at("2026-08-19T09:41:00Z"))).toBe("Wednesday, 19 August 2026 at 09:41");
  });

  /**
   * It does not move as the clock does — only the short label should. This is
   * what the title attribute and the datetime attribute carry, and a value that
   * drifted between renders would make both of them lie.
   */
  it("gives the same answer whenever it is asked", () => {
    const sent = at("2026-08-19T09:41:00Z");
    expect(messageTimeExact(sent)).toBe(messageTimeExact(sent));
  });

  it("reads in the viewer's zone as well", () => {
    expect(messageTimeExact(at("2026-08-19T02:30:00Z"), "America/New_York")).toBe(
      "Tuesday, 18 August 2026 at 22:30",
    );
  });
});

describe("needsDateSeparator", () => {
  it("always marks the first message", () => {
    expect(needsDateSeparator(null, at("2026-08-19T09:00:00Z"))).toBe(true);
  });

  it("stays quiet inside one day", () => {
    expect(needsDateSeparator(at("2026-08-19T09:00:00Z"), at("2026-08-19T23:00:00Z"))).toBe(false);
  });

  it("breaks when the calendar day changes", () => {
    expect(needsDateSeparator(at("2026-08-18T23:59:00Z"), at("2026-08-19T00:01:00Z"))).toBe(true);
  });

  it("uses the viewer's calendar", () => {
    const before = at("2026-08-19T01:00:00Z");
    const after = at("2026-08-19T03:00:00Z");
    expect(needsDateSeparator(before, after, "UTC")).toBe(false);
    // 21:00 then 23:00 the same evening in New York — still one day.
    expect(needsDateSeparator(before, after, "America/New_York")).toBe(false);
    // But 20:00 the 18th to 01:00 the 19th crosses it.
    expect(
      needsDateSeparator(
        at("2026-08-19T00:00:00Z"),
        at("2026-08-19T05:00:00Z"),
        "America/New_York",
      ),
    ).toBe(true);
  });
});

describe("dateSeparatorLabel", () => {
  it("names today and yesterday", () => {
    expect(dateSeparatorLabel(at("2026-08-19T09:00:00Z"), at("2026-08-19T18:00:00Z"))).toBe(
      "Today",
    );
    expect(dateSeparatorLabel(at("2026-08-18T09:00:00Z"), at("2026-08-19T18:00:00Z"))).toBe(
      "Yesterday",
    );
  });

  it("dates anything older, with a year only when it differs", () => {
    expect(dateSeparatorLabel(at("2026-08-12T09:00:00Z"), at("2026-08-19T18:00:00Z"))).toBe(
      "12 Aug",
    );
    expect(dateSeparatorLabel(at("2025-12-30T09:00:00Z"), at("2026-08-19T18:00:00Z"))).toBe(
      "30 Dec 2025",
    );
  });

  /**
   * Not messageTimeLabel with the clock trimmed off it. That is what the first
   * version did, and a divider for today came back as an empty string.
   */
  it("never comes back empty", () => {
    for (const days of [0, 1, 2, 30, 400]) {
      const now = at("2026-08-19T18:00:00Z");
      expect(dateSeparatorLabel(now - days * 86_400_000, now)).not.toBe("");
    }
  });
});
