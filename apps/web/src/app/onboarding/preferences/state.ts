/**
 * Action state for the preferences step.
 *
 * Its own module because a `"use server"` file may export only async functions —
 * see state-exports.test.ts, which exists because that is a build error a long
 * way from its cause.
 */
export interface PreferencesState {
  readonly error: string | null;
  /**
   * Only the editor sets this. Onboarding redirects on success, so it has no
   * "saved" state to be in; the editor stays on the page and needs to say
   * something, or pressing Save looks like pressing nothing.
   */
  readonly saved?: boolean;
}

export const PREFERENCES_INITIAL: PreferencesState = { error: null };
