/**
 * What the join form can be showing.
 *
 * `sent` is the ONLY success state and it does not say what happened — added,
 * already there, already confirmed and rate-limited all land here identically.
 * That is the oracle rule from lib/waitlist.ts reaching the type: if the state
 * could distinguish them, some future render would.
 */
export interface WaitlistState {
  readonly error: string | null;
  readonly sent: boolean;
}

export const WAITLIST_INITIAL: WaitlistState = { error: null, sent: false };
