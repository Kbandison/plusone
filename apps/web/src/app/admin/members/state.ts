/**
 * Action state for these server actions.
 *
 * Separate from the actions file because a `"use server"` module may export
 * ONLY async functions. A non-function export there is fine right up until a
 * Server Component imports the file, and then it is a build error a long way
 * from its cause — see state-exports.test.ts.
 */

export interface Hit {
  readonly user_id: string;
  readonly display_name: string | null;
  readonly verification_status: string;
  readonly created_at: string;
  readonly open_reports: number;
}

export type LookupState = {
  readonly hits: readonly Hit[];
  readonly searched: boolean;
};

export const LOOKUP_INITIAL: LookupState = { hits: [], searched: false };
