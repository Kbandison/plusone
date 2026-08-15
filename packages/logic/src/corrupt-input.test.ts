import { describe, expect, it } from "vitest";

import { canSendConnect, remainingToday, spend } from "./connects/connects";
import type { ConnectBudgetState } from "./connects/types";
import { selectDrop } from "./drop/drop";
import { quizCompat, underexposure } from "./drop/scoring";
import type { DropCandidate, DropViewer } from "./drop/types";
import { changeIntention } from "./modes/modes";
import type { ModeState } from "./modes/types";
import { recordConversion } from "./referrals/referrals";

/**
 * What every mechanic does with a value it should never have been given.
 *
 * These are all pure functions with no I/O, so the only way a NaN or a negative
 * counter reaches them is a corrupt row, a failed parse, or a bug upstream —
 * which is exactly when a mechanic must not quietly stop being a mechanic.
 *
 * The shared failure was comparison. NaN compares false against everything, so
 * every `if (x < limit) refuse` read as "allowed": the daily connect budget
 * became unlimited, the 30-day intention cooldown unlocked permanently, and a
 * NaN score sorted to the FRONT of the Drop rather than the back. Each one
 * failed open, and each one failed open in the direction of more contact.
 */

const T0 = Date.UTC(2026, 0, 1);
const NASTY = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -100];

describe("the connect budget", () => {
  const base: ConnectBudgetState = {
    mode: "dating",
    isPremium: false,
    spentToday: 0,
    roomSentThisWeek: 0,
  };

  it.each(NASTY)("treats spentToday: %p as spent rather than as room to spare", (spentToday) => {
    const state = { ...base, spentToday };
    expect(remainingToday(state)).toBe(0);
    const attempt = canSendConnect(state, "browse");
    expect(attempt.ok, `spentToday ${spentToday} allowed a connect`).toBe(false);
  });

  it("does not inflate the allowance from a negative counter", () => {
    // -100 used to read as 103 connects remaining on a 3/day tier.
    expect(remainingToday({ ...base, spentToday: -100 })).toBe(0);
  });

  it("writes a corrupt counter back as a finite, exhausted one", () => {
    // Infinity would be honest and would also not survive the round trip
    // through Postgres, so the stored value has to be a real number.
    const after = spend({ ...base, spentToday: Number.NaN }, "browse");
    expect(Number.isFinite(after.spentToday)).toBe(true);
    expect(remainingToday(after)).toBe(0);
  });

  it("still allows a normal connect", () => {
    expect(remainingToday(base)).toBeGreaterThan(0);
    expect(canSendConnect(base, "browse").ok).toBe(true);
  });

  it("does not charge a support-only member for a source they cannot use", () => {
    // canSendConnect refuses drop and browse outright for support-only, so
    // charging the weekly budget burned an allowance on an ask never sent.
    const support: ConnectBudgetState = { ...base, mode: "support_only" };
    expect(spend(support, "drop").roomSentThisWeek).toBe(0);
    expect(spend(support, "browse").roomSentThisWeek).toBe(0);
    expect(spend(support, "room").roomSentThisWeek).toBe(1);
  });
});

describe("the intention cooldown", () => {
  const state: ModeState = {
    mode: "dating",
    intention: "long_term",
    intentionChangedAt: T0,
    datingReentryAt: null,
  };

  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses a change at %p rather than unlocking forever",
    (at) => {
      const result = changeIntention(state, "casual", at);
      expect(result.ok).toBe(false);
    },
  );

  it("still opens after thirty days", () => {
    const later = T0 + 31 * 86_400_000;
    expect(changeIntention(state, "casual", later).ok).toBe(true);
  });
});

describe("drop scoring", () => {
  it("never returns a non-finite compatibility", () => {
    for (const vector of [[Number.NaN, 1], [Number.POSITIVE_INFINITY, 0], [0, 0]]) {
      expect(Number.isFinite(quizCompat(vector, [1, 1])), String(vector)).toBe(true);
    }
  });

  it("never returns a non-finite underexposure", () => {
    for (const served of NASTY) {
      expect(Number.isFinite(underexposure(served)), String(served)).toBe(true);
    }
  });

  const candidate = (over: Partial<DropCandidate> & { id: string }): DropCandidate => ({
    distanceMi: 2,
    intention: "long_term",
    quizVector: [1, 1],
    lastActiveAt: T0,
    timesServed: 0,
    verified: true,
    blocked: false,
    reportPending: false,
    alreadyConnected: false,
    lastServedToViewerAt: null,
    ...over,
  });

  const viewer: DropViewer = {
    mode: "dating",
    intention: "long_term",
    quizVector: [1, 1],
    radiusMi: 50,
  };

  it("does not let one poisoned candidate take the front of the Drop", () => {
    const result = selectDrop(
      viewer,
      [
        candidate({ id: "poison", quizVector: [Number.NaN, 1] }),
        candidate({ id: "good-a", quizVector: [1, 1] }),
        candidate({ id: "good-b", quizVector: [0.9, 1] }),
        candidate({ id: "good-c", quizVector: [0.5, 1] }),
      ],
      T0,
    );
    expect(result.cards.map((c) => c.id)).not.toContain("poison");
    expect(result.cards[0]?.id).toBe("good-a");
  });

  it("does not let a corrupt times-served counter rank first", () => {
    const result = selectDrop(
      viewer,
      [
        candidate({ id: "poison", timesServed: Number.NaN }),
        candidate({ id: "good-a" }),
        candidate({ id: "good-b" }),
      ],
      T0,
    );
    expect(result.cards[0]?.id).not.toBe("poison");
  });

  it("never serves the same person twice", () => {
    const dupe = candidate({ id: "same" });
    const result = selectDrop(viewer, [dupe, dupe, candidate({ id: "b" }), candidate({ id: "c" })], T0);
    const ids = result.cards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("c");
  });
});

describe("referral tiers", () => {
  it("still awards a tier whose exact count was skipped", () => {
    // Exact equality meant any state repair or re-count forfeited the tier
    // permanently — it could only ever fire on the one number.
    const result = recordConversion({ conversions: 3, tiersAwarded: [] });
    expect(result.state.tiersAwarded).toContain(3);
  });

  it("does not award the same tier twice", () => {
    const once = recordConversion({ conversions: 2, tiersAwarded: [] });
    const twice = recordConversion(once.state);
    expect(twice.state.tiersAwarded.filter((t) => t === 3)).toHaveLength(1);
  });
});
