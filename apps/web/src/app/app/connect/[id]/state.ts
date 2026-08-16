/**
 * Action state for these server actions.
 *
 * Separate from the actions file because a `"use server"` module may export
 * ONLY async functions. A non-function export there is fine right up until a
 * Server Component imports the file, and then it is a build error a long way
 * from its cause — see state-exports.test.ts.
 */

import { CONNECTS } from "@plusone/config";

export type ConnectState = { readonly error: string | null };

export const CONNECT_INITIAL: ConnectState = { error: null };

export const PERSONAL_LINE_MAX = CONNECTS.personalLineMaxChars;
