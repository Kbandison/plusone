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
};

export const PHONE_INITIAL: PhoneState = { error: null, sentTo: null };

/** The invitation code field (BACKLOG 32). */
export type InviteCodeState = {
  readonly attached: boolean;
  readonly error: string | null;
};

export const INVITE_CODE_INITIAL: InviteCodeState = { attached: false, error: null };
