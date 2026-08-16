/**
 * Action state for these server actions.
 *
 * Separate from the actions file because a `"use server"` module may export
 * ONLY async functions. A non-function export there is fine right up until a
 * Server Component imports the file, and then it is a build error a long way
 * from its cause — see state-exports.test.ts.
 */

import { VERIFICATION } from "@plusone/config";

export type LivenessState = {
  readonly error: string | null;
  readonly attemptsLeft: number;
};

export const LIVENESS_INITIAL: LivenessState = {
  error: null,
  attemptsLeft: VERIFICATION.livenessMaxRetries,
};
