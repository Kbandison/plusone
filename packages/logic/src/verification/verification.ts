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
   * vendor's own threshold — it is a backstop, not the primary gate.
   *
   * It held a literal 0.8, which made that last sentence false: AWS returned
   * SUCCEEDED and this refused it. A tunable that decides who gets into the
   * product belongs with every other tunable, where changing it is a visible
   * act rather than a number edited inside a reducer. See VERIFICATION.
   */
  minScore: VERIFICATION.livenessMinScore,
};

export const INITIAL_STATE: VerificationState = {
  status: "unverified",
  livenessAttempts: 0,
  lastScore: null,
  decidedAt: null,
  appealOpenedAt: null,
  appealDecidedAt: null,
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
      //
      // The code says under_review, not not_under_review. It said the latter
      // for years' worth of a member's confusion in one line: told the opposite
      // of their own situation by any screen that reads the code.
      if (isUnderReview(state.status)) return fail("under_review");
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
      // Open, not ever-opened. Those were the same test, which meant a member
      // got exactly one appeal in their life: the first rejection consumed it,
      // and the rejection itself could then never be appealed — the appeal path
      // locked behind the thing being appealed, which is the one thing
      // Decision #21 names. An appeal that an administrator has already ruled
      // on is a closed appeal, and it stays on the record either way.
      const appealPending =
        state.appealOpenedAt !== null &&
        (state.appealDecidedAt === null || state.appealDecidedAt < state.appealOpenedAt);
      if (appealPending) return fail("appeal_already_open");
      return ok({ ...state, appealOpenedAt: event.at });
    }

    case "admin_decide": {
      // liveness_pending is included deliberately. A provider session that
      // never returns — abandoned, expired, or a provider outage — left the
      // member in a state where every event refused: start_liveness said
      // already_in_progress, verify_phone was a no-op, and admin_decide said
      // not_under_review. Stuck, with no way for a human to reach them.
      //
      // There is no member-facing cancel for the same reason there is no retry
      // from flagged: cancelling a check that is about to fail and starting
      // another is how a member grinds attempts until one passes, and the
      // attempt only counts on liveness_result. So the way out is a person.
      if (!isUnderReview(state.status) && state.status !== "liveness_pending") {
        return fail("not_under_review");
      }
      return ok({
        ...state,
        status: event.approve ? "verified" : "rejected",
        decidedAt: event.at,
        // Closes whatever appeal was outstanding, without erasing it.
        appealDecidedAt: state.appealOpenedAt === null ? state.appealDecidedAt : event.at,
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
