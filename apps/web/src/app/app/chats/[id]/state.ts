/**
 * Action state for these server actions.
 *
 * Separate from the actions file because a `"use server"` module may export
 * ONLY async functions. A non-function export there is fine right up until a
 * Server Component imports the file, and then it is a build error a long way
 * from its cause — see state-exports.test.ts.
 */

export type ChatState = {
  readonly error: string | null;
  /**
   * The moment a send actually succeeded, and the only reliable signal that one
   * did.
   *
   * The composer used to infer it from `pending` going true and then false with
   * no error — which fails twice. CHAT_INITIAL is also `{error: null}`, so
   * "no error" is true on mount and says nothing; and React can batch the two
   * renders, so `pending: true` may never be observed at all. When that
   * happens the box keeps the message that was just sent, and the photograph
   * attached to it stays attached.
   *
   * A value that changes on every success cannot be confused with the initial
   * state or missed by batching. The rooms composer arrived at the same answer.
   */
  readonly sent?: number;
};

export const CHAT_INITIAL: ChatState = { error: null };
