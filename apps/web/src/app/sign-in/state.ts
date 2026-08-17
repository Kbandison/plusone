/**
 * Action state for these server actions.
 *
 * Separate from the actions file because a `"use server"` module may export
 * ONLY async functions. A non-function export there is fine right up until a
 * Server Component imports the file, and then it is a build error a long way
 * from its cause — see state-exports.test.ts.
 */

import type { verification } from "@plusone/logic";

export type SignInState = {
  readonly error: string | null;
  /**
   * Set once a code is in flight — or once we have decided to LOOK like one is
   * (see classifySendFailure). Swapping the form to the code step on both paths
   * is what makes an identifier with no account indistinguishable from one with.
   */
  readonly sentTo: verification.SignInIdentifier | null;
};

export const SIGN_IN_INITIAL: SignInState = { error: null, sentTo: null };
