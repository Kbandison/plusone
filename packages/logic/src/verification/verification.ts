import { VERIFICATION } from "@plusone/config";

import type {
  LivenessOutcome,
  VerificationConfig,
  VerificationErrorCode,
  VerificationEvent,
  VerificationResult,
  VerificationState,
  VerificationStatus,
} from "./types";

export const DEFAULT_VERIFICATION_CONFIG: VerificationConfig = {
  maxLivenessAttempts: VERIFICATION.livenessMaxRetries,
  /**
   * Providers already return a verdict; this is a second, independent floor so
   * that swapping vendors cannot quietly lower the bar. Deliberately below the
   * typical vendor threshold — it is a backstop, not the primary gate.
   */
  minScore: 0.8,
};

export const INITIAL_STATE: VerificationState = {
  status: "unverified",
  livenessAttempts: 0,
  lastScore: null,
  decidedAt: null,
  appealOpenedAt: null,
};

const ok = (state: VerificationState): VerificationResult => ({ ok: true, state });
const fail = (code: VerificationErrorCode): VerificationResult => ({ ok: false, code });

/** A status a member cannot leave without an administrator. */
export function isUnderReview(status: VerificationStatus): boolean {
  return status === "flagged" || status === "rejected";
}

/**
 * Whether an outcome clears BOTH gates: the provider's own verdict and our
 * independent floor. A provider that says "passed" with a score below the floor
 * does not pass.
 */
export function isAcceptable(outcome: LivenessOutcome, config: VerificationConfig): boolean {
  return outcome.passed && outcome.score >= config.minScore;
}

/**
 * The whole verification pipeline as one pure reducer.
 *
 * Every transition is a function of (state, event, config) — no clock, no I/O,
 * no provider. The liveness provider is called by the caller; its result
 * arrives here as data.
 */
export function transition(
  state: VerificationState,
  event: VerificationEvent,
  config: VerificationConfig = DEFAULT_VERIFICATION_CONFIG,
): VerificationResult {
  switch (event.type) {
    case "verify_phone": {
      if (state.status === "verified") return fail("already_verified");
      // Re-running the OTP is harmless and happens on device changes, so it is
      // idempotent rather than an error — but it must never walk a member back
      // out of review, or failing liveness three times and re-verifying a phone
      // would be a way around the flag queue.
      if (isUnderReview(state.status) || state.status === "liveness_pending") return ok(state);
      return ok({ ...state, status: "phone_verified" });
    }

    case "start_liveness": {
      if (state.status === "verified") return fail("already_verified");
      if (state.status === "liveness_pending") return fail("liveness_already_in_progress");
      // Under review, only an administrator moves a member. Letting them start
      // a fresh check here would let a flagged member grind attempts until one
      // passed, which is exactly what the flag exists to stop.
      if (isUnderReview(state.status)) return fail("not_under_review");
      if (state.status !== "phone_verified") return fail("phone_not_verified");
      return ok({ ...state, status: "liveness_pending" });
    }

    case "liveness_result": {
      if (state.status !== "liveness_pending") return fail("no_liveness_in_progress");
      const { score } = event.outcome;
      if (!Number.isFinite(score) || score < 0 || score > 1) return fail("score_out_of_range");

      const attempts = state.livenessAttempts + 1;

      if (isAcceptable(event.outcome, config)) {
        return ok({
          ...state,
          status: "verified",
          livenessAttempts: attempts,
          lastScore: score,
          decidedAt: event.at,
        });
      }

      // Out of attempts sends the member to a HUMAN, not to a wall. `rejected`
      // is a decision an administrator makes; the machine never reaches it on
      // its own, because an automated dead end with no way out is the hostile
      // verification Decision #21 is a reaction to.
      if (attempts >= config.maxLivenessAttempts) {
        return ok({
          ...state,
          status: "flagged",
          livenessAttempts: attempts,
          lastScore: score,
          decidedAt: event.at,
        });
      }

      // Attempts remain: back to phone_verified so the member can retry.
      return ok({
        ...state,
        status: "phone_verified",
        livenessAttempts: attempts,
        lastScore: score,
      });
    }

    case "open_appeal": {
      // Decision #21: "Appeal path never locked behind the thing being
      // appealed." This branch reads state.status and NOTHING else — not
      // livenessAttempts, not lastScore. A member who never passed a check can
      // still ask a human to look.
      if (!isUnderReview(state.status)) return fail("not_under_review");
      if (state.appealOpenedAt !== null) return fail("appeal_already_open");
      return ok({ ...state, appealOpenedAt: event.at });
    }

    case "admin_decide": {
      if (!isUnderReview(state.status)) return fail("not_under_review");
      return ok({
        ...state,
        status: event.approve ? "verified" : "rejected",
        decidedAt: event.at,
      });
    }
  }
}

/** Attempts a member has left before a human gets involved. Never negative. */
export function attemptsRemaining(
  state: VerificationState,
  config: VerificationConfig = DEFAULT_VERIFICATION_CONFIG,
): number {
  return Math.max(0, config.maxLivenessAttempts - state.livenessAttempts);
}

/** Whether the profile carries the verified badge (Decision #21). */
export function isVerified(state: VerificationState): boolean {
  return state.status === "verified";
}

/** Whether this member is waiting on the admin flag queue. */
export function needsHumanReview(state: VerificationState): boolean {
  return state.status === "flagged";
}
