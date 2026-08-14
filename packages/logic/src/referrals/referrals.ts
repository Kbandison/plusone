import { REFERRALS } from "@plusone/config";

import type {
  ConversionOutcome,
  ReferralConfig,
  ReferralState,
  Reward,
} from "./types";

export const DEFAULT_REFERRAL_CONFIG: ReferralConfig = {
  inviteeGrantDays: REFERRALS.inviteeGrantDays,
  referrerGrantDaysPerConversion: REFERRALS.referrerGrantDaysPerConversion,
  rewardCap: REFERRALS.rewardCap,
  tiers: [
    REFERRALS.tiers.tier1_3,
    REFERRALS.tiers.tier2_5,
    REFERRALS.tiers.tier3_10,
  ],
};

/**
 * An invitee reached `verified` (§6.5 — conversion counts on verification, not
 * on signup, so an unfinished account earns nobody anything).
 */
export function recordConversion(
  state: ReferralState,
  config: ReferralConfig = DEFAULT_REFERRAL_CONFIG,
): ConversionOutcome {
  const conversions = state.conversions + 1;
  const referrerRewards: Reward[] = [];

  // Per-conversion grant, up to the cap. Past it the counter keeps rising and
  // the grants stop — see the note in types.ts.
  if (conversions <= config.rewardCap) {
    referrerRewards.push({
      kind: "premium_days",
      days: config.referrerGrantDaysPerConversion,
      status: "auto_granted",
      reason: "conversion",
    });
  }

  const tiersAwarded = [...state.tiersAwarded];

  for (const tier of config.tiers) {
    if (conversions !== tier.conversions) continue;
    if (tiersAwarded.includes(tier.conversions)) continue;
    tiersAwarded.push(tier.conversions);

    if (tier.badge) {
      referrerRewards.push({
        kind: "badge",
        badge: tier.badge,
        status: "auto_granted",
        tier: tier.conversions,
      });
    }

    if (tier.grantDays > 0) {
      referrerRewards.push({
        kind: "premium_days",
        days: tier.grantDays,
        // Decision #25 — the ten-conversion tier is worth six months, and six
        // months is worth a human look. Auto-granting it is how a referral
        // programme becomes a fraud target.
        status: tier.autoGrant ? "auto_granted" : "pending_approval",
        reason: "tier",
        tier: tier.conversions,
      });
    }
  }

  return {
    state: { conversions, tiersAwarded },
    referrerRewards,
    inviteeRewards: [
      { kind: "premium_days", days: config.inviteeGrantDays, status: "auto_granted", reason: "conversion" },
    ],
  };
}

/**
 * What the profile shows: "{n} people joined through you". Never capped, never
 * rounded, never stops.
 */
export function publicConversionCount(state: ReferralState): number {
  return state.conversions;
}

/** Whether further conversions still earn an automatic grant. */
export function earnsRewards(
  state: ReferralState,
  config: ReferralConfig = DEFAULT_REFERRAL_CONFIG,
): boolean {
  return state.conversions < config.rewardCap;
}

/** Total premium days auto-granted for a run of conversions. For projections. */
export function autoGrantedDays(rewards: readonly Reward[]): number {
  return rewards
    .filter((r) => r.kind === "premium_days" && r.status === "auto_granted")
    .reduce((total, r) => total + (r.kind === "premium_days" ? r.days : 0), 0);
}

/** Rewards a human has to approve before they mean anything. */
export function pendingRewards(rewards: readonly Reward[]): readonly Reward[] {
  return rewards.filter((r) => r.status === "pending_approval");
}
