/**
 * Action state for these server actions.
 *
 * Separate from the actions file because a `"use server"` module may export
 * ONLY async functions. A non-function export there is fine right up until a
 * Server Component imports the file, and then it is a build error a long way
 * from its cause — see state-exports.test.ts.
 */

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
  /** Set once a session is open, which is what puts the camera on screen. */
  readonly session: {
    readonly sessionId: string;
    readonly region: string;
    readonly credentials: BrowserCredentials;
  } | null;
};

export const LIVENESS_INITIAL: LivenessState = {
  error: null,
  // Only a starting label. The row is what decides.
  attemptsLeft: 0,
  session: null,
};
