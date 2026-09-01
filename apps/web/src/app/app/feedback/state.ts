export interface FeedbackState {
  readonly error: string | null;
  readonly sent: boolean;
}

export const FEEDBACK_INITIAL: FeedbackState = { error: null, sent: false };
