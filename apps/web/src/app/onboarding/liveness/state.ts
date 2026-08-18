/**
 * Action state for these server actions.
 *
 * Separate from the actions file because a `"use server"` module may export
 * ONLY async functions. A non-function export there is fine right up until a
 * Server Component imports the file, and then it is a build error a long way
 * from its cause — see state-exports.test.ts.
 */

import { VERIFICATION } from "@plusone/config";

import type { BrowserCredentials } from "@/lib/liveness-aws";

/**
 * What the browser needs to run one check.
 *
 * `attemptsLeft` is DISPLAY ONLY and the server never reads it back. It used to
 * be the count itself, handed to the action as `previous.attemptsLeft` and
 * trusted — React sends this state with the action call and nothing signs it,
 * so a crafted request bought unlimited tries at the check the whole product
 * rests on. The count lives on profiles.liveness_attempts now.
 */
export type LivenessState = {
  readonly error: string | null;
  readonly attemptsLeft: number;
  /**
   * A human is now looking at this member (Decision #21).
   *
   * Explicit, and NOT inferred from `attemptsLeft === 0`. The form used to
   * derive it that way, and when the count moved to the server the initial
   * state honestly said "0 attempts left, I have not asked yet" — so every
   * member landed on "We will take a look" before pressing anything. Only the
   * server knows this, so only the server says it.
   *
   * It was also a single boolean, which merged two situations a member
   * experiences completely differently: "nobody has looked yet" and "somebody
   * looked and said no". The second needs a way to ask again, and had none.
   */
  readonly review: {
    readonly status: "flagged" | "rejected";
    /** An appeal is open, so the member is waiting rather than being asked. */
    readonly appealOpen: boolean;
  } | null;
  /**
   * Which phase produced this state.
   *
   * The form runs two action states and has to know which spoke last. It used
   * to guess — "finished, if it has an error" — which is wrong in exactly the
   * case that matters: a member flagged for review comes back with no error at
   * all, so the guess fell through to the stale begin state and offered them a
   * retry button for a step they can no longer pass.
   */
  readonly phase: "idle" | "open" | "settled";
  /** Set once a session is open, which is what puts the camera on screen. */
  readonly session: {
    readonly sessionId: string;
    readonly region: string;
    readonly credentials: BrowserCredentials;
  } | null;
};

export const LIVENESS_INITIAL: LivenessState = {
  error: null,
  // A label only, replaced by the row on the first response.
  attemptsLeft: VERIFICATION.livenessMaxRetries,
  review: null,
  phase: "idle",
  session: null,
};

/** Which of the two actions produced the state now on screen. */
export type LivenessSpeaker = "begin" | "finish";

/**
 * Which action's state the form should render.
 *
 * The form runs two `useActionState` pairs and only one of them is the news.
 * Both earlier attempts at this rule inferred the answer from the states
 * themselves and both were wrong:
 *
 *   `finished.error !== null` — a member flagged for review comes back with no
 *   error at all, so the verdict was discarded and a retry button was offered
 *   for a step they can no longer pass.
 *
 *   `finished.phase !== "idle" && begun.phase === "idle"` — `begun` is idle only
 *   until the member first presses Start, and it never returns. So from the
 *   first press onward the finish result could NEVER win, and every completed
 *   check rendered the stale open-session state: no pass, no fail, no review,
 *   just the start screen again. That is what a member reported, and the test
 *   that was supposed to cover it asserted the shape of this expression rather
 *   than what it decides.
 *
 * There is nothing in either state that says which is newer, so the form
 * records which action it dispatched last and that is what is asked here.
 */
export function pickLivenessState(
  speaker: LivenessSpeaker,
  begun: LivenessState,
  finished: LivenessState,
): LivenessState {
  return speaker === "finish" ? finished : begun;
}
