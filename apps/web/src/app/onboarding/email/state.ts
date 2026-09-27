export type BackupEmailState = {
  readonly error: string | null;
  /** The address a code was sent to. Shown back to the member, never trusted. */
  readonly sentTo: string | null;
};

export const BACKUP_EMAIL_INITIAL: BackupEmailState = { error: null, sentTo: null };
