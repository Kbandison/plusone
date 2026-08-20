/**
 * Action state for the news screen.
 *
 * Separate from the actions file because a `"use server"` module may export
 * ONLY async functions — see state-exports.test.ts.
 */
export type NewsState = { readonly error: string | null; readonly message: string | null };

export const NEWS_INITIAL: NewsState = { error: null, message: null };
