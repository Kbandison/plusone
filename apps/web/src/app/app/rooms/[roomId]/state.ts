/**
 * Action state for these server actions.
 *
 * Separate from the actions file because a `"use server"` module may export
 * ONLY async functions. A non-function export there is fine right up until a
 * Server Component imports the file, and then it is a build error a long way
 * from its cause — see state-exports.test.ts.
 */

export type RoomState = {
  readonly error: string | null;
  /**
   * When the post landed, and the only reliable signal that it did.
   *
   * "no error, and pending has just gone false" looked like success and is not:
   * ROOM_INITIAL is also {error: null}, so the test is true before anything is
   * sent, and watching `pending` go true then false depends on React rendering
   * both — which it does not have to. Batch the two and the composer never sees
   * the transition, never clears itself and never closes.
   *
   * A value that changes on every success cannot be missed that way: the effect
   * watching it runs because it changed, not because it was inferred.
   */
  readonly posted?: number;
};

export const ROOM_INITIAL: RoomState = { error: null };
