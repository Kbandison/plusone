/**
 * Action state for these server actions.
 *
 * Separate from the actions file because a `"use server"` module may export
 * ONLY async functions. A non-function export there is fine right up until a
 * Server Component imports the file, and then it is a build error a long way
 * from its cause — see state-exports.test.ts.
 */

export type PhoneState = {
  readonly error: string | null;
  /** Set once a code is in flight, which is what swaps the form to the code step. */
  readonly sentTo: string | null;
  /**
   * The closed beta refused to make an account for this number.
   *
   * A THIRD state rather than an error string, because it is not an error and
   * must not be rendered as one: the person did nothing wrong, the app is
   * working exactly as intended, and what they need is the waitlist rather than
   * "try again". An error message here would send somebody to re-type a number
   * that will be refused identically every time.
   *
   * Only ever true for a number that has NO account. An existing member typing
   * their own number on this screen still gets a code — see the gate in
   * actions.ts.
   */
  readonly closed?: boolean;
};

export const PHONE_INITIAL: PhoneState = { error: null, sentTo: null };
