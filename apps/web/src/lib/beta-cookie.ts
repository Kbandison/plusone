import { WAITLIST_INVITE_TTL_DAYS } from "@plusone/config";

/**
 * The beta invitation cookie, defined once for its two writers.
 *
 * The proxy sets it when `/beta/<code>` opens; the signup screen sets it when
 * somebody types the code instead (BACKLOG 32). Two writers with their own
 * copies of the name and options would be two cookies the day one of them
 * changes — and the reader in onboarding/phone/actions.ts would see one.
 *
 * No `server-only`: the proxy imports this too.
 */
export const BETA_COOKIE = "plusone_beta";

export const BETA_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: true,
  path: "/",
  // The database is what actually expires an invitation; this only stops a
  // stale cookie outliving the one it names by months.
  maxAge: 60 * 60 * 24 * WAITLIST_INVITE_TTL_DAYS,
} as const;
