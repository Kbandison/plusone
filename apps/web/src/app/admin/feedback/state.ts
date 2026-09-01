export interface TriageState {
  readonly error: string | null;
  readonly message: string | null;
}

export const TRIAGE_INITIAL: TriageState = { error: null, message: null };
