/**
 * Action state for these server actions.
 *
 * Separate from the actions file because a `"use server"` module may export
 * ONLY async functions. A non-function export there is fine right up until a
 * Server Component imports the file, and then it is a build error a long way
 * from its cause — see state-exports.test.ts.
 */

export type ReportDecisionState = {
  readonly error: string | null;
  readonly message: string | null;
};

export const REPORT_DECISION_INITIAL: ReportDecisionState = {
  error: null,
  message: null,
};
