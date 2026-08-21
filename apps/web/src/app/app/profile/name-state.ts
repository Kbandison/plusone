/**
 * Action state for the name editor.
 *
 * Separate from the actions file because a `"use server"` module may export
 * ONLY async functions — see state-exports.test.ts.
 */
export type NameState = { readonly error: string | null; readonly message: string | null };

export const NAME_INITIAL: NameState = { error: null, message: null };
