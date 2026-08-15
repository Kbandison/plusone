import { describe, expect, it } from "vitest";

import {
  DEFAULT_REFERRAL_CONFIG,
  NO_REFERRALS,
  autoGrantedDays,
  earnsRewards,
  pendingRewards,
  publicConversionCount,
  recordConversion,
  type ReferralState,
  type Reward,
} from "./index";

/** Runs `n` conversions and hands back the state plus everything earned. */
function run(n: number): { state: ReferralState; rewards: Reward[] } {
  let state = NO_REFERRALS;
  const rewards: Reward[] = [];
  for (let i = 0; i < n; i++) {
    const outcome = recordConversion(state);
    state = outcome.state;
    rewards.push(...outcome.referrerRewards);
  }
  return { state, rewards };
}

describe("conversions", () => {
  it("grants the referrer 14 days each", () => {
    const { rewards } = run(1);
    expect(rewards).toContainEqual({
      kind: "premium_days",
      days: 14,
      status: "auto_granted",
      reason: "conversion",
    });
  });

  it("grants the invitee 14 days for finishing verification", () => {
    expect(recordConversion(NO_REFERRALS).inviteeRewards).toEqual([
      { kind: "premium_days", days: 14, status: "auto_granted", reason: "conversion" },
    ]);
  });

  it("counts them", () => {
    expect(run(7).state.conversions).toBe(7);
  });
});

describe("tiers", () => {
  it("grants a month at three, automatically", () => {
    const third = recordConversion(run(2).state).referrerRewards;
    expect(third).toContainEqual({
      kind: "premium_days",
      days: 30,
      status: "auto_granted",
      reason: "tier",
      tier: 3,
    });
  });

  it("grants the Founding Member badge at five", () => {
    const fifth = recordConversion(run(4).state).referrerRewards;
    expect(fifth).toContainEqual({
      kind: "badge",
      badge: "Founding Member",
      status: "auto_granted",
      tier: 5,
    });
  });

  // Decision #25 — six months is worth a human look. Auto-granting it is how a
  // referral programme becomes a fraud target.
  it("holds the six months at ten for approval", () => {
    const tenth = recordConversion(run(9).state).referrerRewards;
    const tier = tenth.find((r) => r.kind === "premium_days" && r.reason === "tier");
    expect(tier).toMatchObject({ days: 180, status: "pending_approval", tier: 10 });
    expect(pendingRewards(tenth)).toHaveLength(1);
  });

  it("never awards the same tier twice", () => {
    const { rewards } = run(20);
    for (const threshold of [3, 5, 10]) {
      const awarded = rewards.filter((r) => "tier" in r && r.tier === threshold);
      expect(awarded.length, `tier ${threshold} awarded ${awarded.length} times`).toBeGreaterThan(
        0,
      );
      const grants = awarded.filter((r) => r.kind === "premium_days");
      expect(grants.length).toBeLessThanOrEqual(1);
    }
  });

  it("records which tiers have been handed out", () => {
    expect(run(12).state.tiersAwarded).toEqual([3, 5, 10]);
  });
});

// The number is the point for most people, and pretending otherwise would be
// the cheap read. Rewards stop; the counter does not.
describe("rewards stop at ten, the counter never does", () => {
  it("pays nothing per conversion past the cap", () => {
    const eleventh = recordConversion(run(10).state).referrerRewards;
    expect(
      eleventh.filter((r) => r.kind === "premium_days" && r.reason === "conversion"),
    ).toHaveLength(0);
  });

  it("still pays on the tenth", () => {
    const tenth = recordConversion(run(9).state).referrerRewards;
    expect(tenth.some((r) => r.kind === "premium_days" && r.reason === "conversion")).toBe(true);
  });

  it("keeps counting to 47 and beyond", () => {
    const { state } = run(47);
    expect(publicConversionCount(state)).toBe(47);
    expect(earnsRewards(state)).toBe(false);
  });

  it("never caps the public count", () => {
    for (const n of [1, 10, 11, 100]) {
      expect(publicConversionCount(run(n).state)).toBe(n);
    }
  });

  it("auto-grants a bounded total, whatever the volume", () => {
    // 10 conversions x 14d, plus the 30d tier. The 180d tier is pending, so it
    // is deliberately not in this number.
    expect(autoGrantedDays(run(100).rewards)).toBe(10 * 14 + 30);
  });
});

describe("purity", () => {
  it("never mutates the state it is given", () => {
    const state = run(4).state;
    const snapshot = structuredClone(state);
    recordConversion(state);
    expect(state).toEqual(snapshot);
  });

  it("is deterministic", () => {
    const state = run(2).state;
    expect(recordConversion(state)).toEqual(recordConversion(state));
  });

  it("reads no clock — a conversion is an event, not a moment", () => {
    const source = recordConversion.toString();
    expect(source).not.toMatch(/Date\.now|new Date/);
  });

  it("uses the locked config defaults", () => {
    expect(DEFAULT_REFERRAL_CONFIG.rewardCap).toBe(10);
    expect(DEFAULT_REFERRAL_CONFIG.inviteeGrantDays).toBe(14);
    expect(DEFAULT_REFERRAL_CONFIG.tiers.map((t) => t.conversions)).toEqual([3, 5, 10]);
  });
});
