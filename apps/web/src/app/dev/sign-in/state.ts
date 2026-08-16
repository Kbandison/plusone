/**
 * Action state for the development sign-in.
 *
 * Separate from actions.ts because a `"use server"` module may export ONLY
 * async functions. A non-function export there is fine right up until a Server
 * Component imports the file, and then it is a build error a long way from its
 * cause — see state-exports.test.ts.
 */
export type DevSignInState = { readonly error: string | null };

export const DEV_SIGN_IN_INITIAL: DevSignInState = { error: null };
