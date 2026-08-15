/**
 * Referrals (§6.5, Decision #25).
 *
 * The property this module exists to guarantee, in the spec's own words:
 *
 *   "Referral state NEVER feeds drop scoring, browse rank, or any matching
 *    surface (assert in tests)."
 *
 * So `ReferralState` is not reachable from anything the scorer sees, and the
 * drop module asserts behaviourally that two otherwise identical candidates
 * score the same however many people they have invited. A referral programme
 * that quietly boosts reach is an advertising product wearing a friend's face,
 * and the moment members suspect it the invitations stop being honest.
 *
 * The second, smaller promise: rewards stop at ten, the counter never does.
 * "47 people joined through you" keeps being true long after it stops paying,
 * because the number is the point for most people and pretending otherwise
 * would be the cheap read.
 */

export type RewardStatus = "auto_granted" | "pending_approval";

export type Reward =
  | {
      readonly kind: "premium_days";
      readonly days: number;
      readonly status: RewardStatus;
      readonly reason: "conversion" | "tier";
      readonly tier?: number;
    }
  | {
      readonly kind: "badge";
      readonly badge: string;
      readonly status: "auto_granted";
      readonly tier: number;
    };

export interface ReferralState {
  /** Every invitee who has ever reached `verified`. Never capped. */
  readonly conversions: number;
  /** Tier thresholds already awarded, so none is granted twice. */
  readonly tiersAwarded: readonly number[];
}

export const NO_REFERRALS: ReferralState = { conversions: 0, tiersAwarded: [] };

export interface ReferralTier {
  readonly conversions: number;
  readonly grantDays: number;
  readonly autoGrant: boolean;
  readonly badge?: string;
}

export interface ReferralConfig {
  readonly inviteeGrantDays: number;
  readonly referrerGrantDaysPerConversion: number;
  readonly rewardCap: number;
  readonly tiers: readonly ReferralTier[];
}

export interface ConversionOutcome {
  readonly state: ReferralState;
  /** What the referrer earns. Empty once past the cap with no tier crossed. */
  readonly referrerRewards: readonly Reward[];
  /** What the invitee earns for finishing verification. */
  readonly inviteeRewards: readonly Reward[];
}
