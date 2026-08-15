/**
 * Verification (§4.2, Decision #21).
 *
 * Phone OTP, then automated selfie liveness. Target under two minutes with no
 * human in the loop on the clean path; a human sees a member ONLY on a risk
 * flag.
 *
 * Two structural properties this module exists to guarantee:
 *
 *   1. NO RAW MEDIA EVER ENTERS THE STATE. §4.2 says the selfie is purged at
 *      decision time and only a boolean and a score survive. There is no field
 *      on VerificationState that can hold a file id, URL or image — the purge
 *      cannot be forgotten because there is nowhere for the thing to be kept.
 *
 *   2. THE APPEAL IS NEVER GATED ON THE THING BEING APPEALED. A member who
 *      failed liveness can open an appeal without passing liveness. Requiring
 *      the check you are appealing is the trap Decision #21 names explicitly,
 *      and the machine refuses to represent it: `open_appeal` is accepted from
 *      every rejected state and consults no liveness history.
 */

/** Mirrors public.verification_status in the SQL exactly. */
export type VerificationStatus =
  "unverified" | "phone_verified" | "liveness_pending" | "verified" | "flagged" | "rejected";

/** States a member cannot leave without an administrator. */
export const REVIEW_STATUSES = ["flagged", "rejected"] as const;

/**
 * The adapter seam (§4.2 — "swappable adapter"). Providers calibrate their own
 * thresholds differently, so they report BOTH their own verdict and a raw
 * score; the accept rule lives here, not in the vendor.
 */
export interface LivenessOutcome {
  /** The provider's own pass/fail verdict. */
  readonly passed: boolean;
  /** Confidence in [0, 1]. The only number that survives the purge. */
  readonly score: number;
}

export type LivenessProviderName = "aws_rekognition" | "stripe_identity" | "facetec" | "stub";

/** An in-flight check. The id is opaque and carries no member identity. */
export interface LivenessSession {
  readonly sessionId: string;
  readonly provider: LivenessProviderName;
}

/**
 * What every liveness provider must implement. Deliberately narrow: start a
 * check, read its outcome. Anything a provider returns beyond `LivenessOutcome`
 * — extracted names, dates of birth, document images — has nowhere to go.
 */
export interface LivenessProvider {
  readonly name: LivenessProviderName;
  createSession(): Promise<LivenessSession>;
  fetchOutcome(sessionId: string): Promise<LivenessOutcome>;
}

export interface VerificationState {
  readonly status: VerificationStatus;
  /** Completed liveness attempts. Counts toward maxLivenessAttempts. */
  readonly livenessAttempts: number;
  /** Score of the most recent completed attempt. Null before the first. */
  readonly lastScore: number | null;
  /** Epoch ms of the decision that produced a terminal status. */
  readonly decidedAt: number | null;
  /** Epoch ms. Non-null once the member has asked for human review. */
  readonly appealOpenedAt: number | null;
  /**
   * Epoch ms of the ruling on that appeal. Null while one is outstanding.
   *
   * Separate from `decidedAt`, which is also set when the machine flags a
   * member — overloading the two made "an appeal is open" indistinguishable
   * from "an appeal once happened", and a member got one appeal in their life.
   */
  readonly appealDecidedAt: number | null;
}

export type VerificationEvent =
  | { readonly type: "verify_phone"; readonly at: number }
  | { readonly type: "start_liveness"; readonly at: number }
  | {
      readonly type: "liveness_result";
      readonly at: number;
      readonly outcome: LivenessOutcome;
    }
  | { readonly type: "open_appeal"; readonly at: number }
  | {
      readonly type: "admin_decide";
      readonly at: number;
      readonly approve: boolean;
    };

export type VerificationErrorCode =
  | "already_verified"
  | "phone_not_verified"
  | "no_liveness_in_progress"
  | "liveness_already_in_progress"
  | "not_under_review"
  | "appeal_already_open"
  | "score_out_of_range";

export type VerificationResult =
  | { readonly ok: true; readonly state: VerificationState }
  | { readonly ok: false; readonly code: VerificationErrorCode };

export interface VerificationConfig {
  /** Attempts before a human is involved. VERIFICATION.livenessMaxRetries. */
  readonly maxLivenessAttempts: number;
  /**
   * Floor applied on top of the provider's own verdict, so tightening does not
   * require a vendor change and swapping vendors does not silently loosen.
   */
  readonly minScore: number;
}
