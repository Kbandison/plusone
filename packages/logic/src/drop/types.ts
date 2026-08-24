import type { Intention } from "../modes/types";

/**
 * The Drop (§6.1, Decisions #9 and #11).
 *
 * Three structural properties this module exists to guarantee:
 *
 *   1. REFERRALS CANNOT REACH SCORING. §6.5: "Referral state NEVER feeds drop
 *      scoring, browse rank, or any matching surface (assert in tests)." There
 *      is no referral field on `Candidate`, so a scorer that wanted to use one
 *      would have nothing to read — and a test scores two candidates identical
 *      but for their invite counts and requires the same number back.
 *
 *   2. THE POOL IS NEVER PADDED. §6.1 step 4: "fewer if pool thin — never pad
 *      with stale profiles". Serving two real people beats serving three when
 *      the third is someone who last opened the app in March. `selectDrop`
 *      returns what it has.
 *
 *   3. EVERYONE GETS THE SAME THREE. Decision #11 — the count does not vary by
 *      payment or by intention, so `count` comes from config and the selector
 *      never sees whether the viewer pays.
 */

export interface DropCandidate {
  readonly id: string;
  readonly distanceMi: number;
  readonly intention: Intention;
  /** Normalised trait vector from the quiz, or null if they skipped it. */
  readonly quizVector: readonly number[] | null;
  /** Epoch ms. */
  readonly lastActiveAt: number;
  /** How many drops this profile has already appeared in. Drives underexposure. */
  readonly timesServed: number;
  readonly verified: boolean;
  readonly blocked: boolean;
  readonly reportPending: boolean;
  readonly alreadyConnected: boolean;
  /** Epoch ms of the last time this viewer was shown this candidate. */
  readonly lastServedToViewerAt: number | null;
  // Deliberately no referral fields. See property 1 above.
}

export interface DropViewer {
  readonly intention: Intention;
  readonly quizVector: readonly number[] | null;
  readonly radiusMi: number;
  readonly mode: "dating" | "support_only";
}

export interface ScoredCandidate {
  readonly id: string;
  readonly score: number;
  readonly parts: {
    readonly intentionCompat: number;
    readonly quizCompat: number;
    readonly recencyActive: number;
    readonly underexposure: number;
  };
}

export interface DropResult {
  readonly cards: readonly ScoredCandidate[];
  /** The radius the pool was actually drawn from. */
  readonly radiusUsedMi: number;
  /** §6.1 step 2 — the honesty line shows whenever this is true. */
  readonly radiusExpanded: boolean;
  /** §6.1 step 5 — support-only viewers get the redacted variant. */
  readonly preview: boolean;
  /** How many candidates survived filtering at the radius used. */
  readonly poolSize: number;
  /**
   * The weights this drop was actually scored with, after density.
   *
   * Returned rather than inferred: the whole point of Decision #10 is that the
   * mix moves on its own, and a mechanism that adjusts itself invisibly is one
   * nobody can check. An admin looking at a drop should be able to see what it
   * weighted, not recompute it.
   */
  readonly weightsUsed: DropConfig["weights"];
}

export interface DropConfig {
  readonly count: number;
  readonly activeWithinDays: number;
  readonly suppressRecentlyServedDays: number;
  readonly minPool: number;
  readonly ladderMi: readonly number[];
  readonly weights: {
    readonly intentionCompat: number;
    readonly quizCompat: number;
    readonly recencyActive: number;
    readonly underexposure: number;
  };
  /** Decision #10 — how the weights above tighten as the local pool grows. */
  readonly density: {
    readonly saturationPool: number;
    readonly maxIntentionCompat: number;
  };
}
