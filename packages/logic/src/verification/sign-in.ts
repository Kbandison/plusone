/**
 * How a member gets back in (Decision #21, read precisely).
 *
 * #21 governs VERIFICATION: "Phone OTP + automated selfie liveness." That is
 * how someone proves, once, that they are a real person. It does not say a
 * member who already proved it must prove it again by SMS every time they come
 * back — and treating it that way had two costs. Every returning member on a
 * new device spent a paid message, and a member whose number changed had no
 * route back into an account holding their photos and their chats.
 *
 * So: THE PHONE STILL MAKES THE ACCOUNT. An email only reopens one.
 *
 * Two structural properties this module exists to guarantee:
 *
 *   1. AN EMAIL CANNOT CREATE A MEMBER. `canAddSignInEmail` refuses on any
 *      account whose phone is not confirmed, so the address is always added to
 *      something a phone already made. The phone number stays the one scarce
 *      thing in the system — the only credential that costs a banned person
 *      anything to replace. Email is free and infinite, which is exactly why it
 *      is a way back to an account and never a way to mint one.
 *
 *   2. ADDING AN EMAIL PROVES NOTHING. There is no return value here that can
 *      advance a verification status, and no caller can read one out. A second
 *      way through the door is not a second way past liveness.
 */

export type SignInMethod = "phone" | "email";

/** What a member typed on the sign-in screen, once we know which it is. */
export interface SignInIdentifier {
  readonly method: SignInMethod;
  /** E.164 for a phone; lowercased address for an email. */
  readonly value: string;
}

/**
 * Local addresses are opaque by spec — quoted strings, plus-addressing and
 * unicode are all legal — so this checks shape rather than trying to be an
 * authority: exactly one @, no whitespace, and a dotted domain. The address is
 * proved by the code we send to it, which is the only test that means anything.
 *
 * Deliberately NOT screened against disposable-domain lists. That screening
 * exists to stop throwaway REGISTRATION, and an email cannot register here
 * (property 1) — so it would cost real members access while buying nothing.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Addresses longer than this are rejected by mail servers anyway (RFC 5321). */
export const MAX_EMAIL_LENGTH = 254;

export function normalizeEmail(input: string): string | null {
  // Case is not significant in the domain, and mixed case in a typed address is
  // almost always the keyboard rather than the member. Lowercased so the same
  // person typing "Kevin@" and "kevin@" reaches the same account.
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > MAX_EMAIL_LENGTH) return null;
  return EMAIL.test(trimmed) ? trimmed : null;
}

/**
 * One field that takes either. A member coming back after months does not
 * remember which way they signed up, and a phone/email toggle makes them guess
 * before we have any reason to make them.
 *
 * The @ decides it, because no phone number contains one and every address
 * does. An input that is neither is not guessed at.
 */
export function classifyIdentifier(
  input: string,
  normalizePhone: (raw: string) => string | null,
): SignInIdentifier | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.includes("@")) {
    const email = normalizeEmail(trimmed);
    return email ? { method: "email", value: email } : null;
  }

  const phone = normalizePhone(trimmed);
  return phone ? { method: "phone", value: phone } : null;
}

export type AddEmailRefusal =
  /** No confirmed phone on the account — property 1. */
  | "phone_not_confirmed"
  /** Not an address we can send to. */
  | "email_invalid"
  /** Already the address on this account; nothing to do. */
  | "email_unchanged";

export type AddEmailResult =
  | { readonly ok: true; readonly email: string }
  | { readonly ok: false; readonly code: AddEmailRefusal };

export interface AddEmailFacts {
  /** auth.users.phone_confirmed_at exists. The anchor. */
  readonly phoneConfirmed: boolean;
  /** The address already on the account, if any. */
  readonly currentEmail: string | null;
}

/**
 * Whether this account may take this address as a second way in.
 *
 * Note what is NOT consulted: `VerificationStatus`. A member who is still
 * `phone_verified` and has not yet passed liveness may add an email — losing
 * access mid-onboarding is the worst moment for it, and the email opens exactly
 * as much of the app as their status already allowed, which is the point of
 * property 2. `flagged` and `rejected` members may add one too: #21 says the
 * appeal path is never locked behind the thing being appealed, and an account
 * you cannot sign into is an appeal you cannot file.
 */
export function canAddSignInEmail(input: string, facts: AddEmailFacts): AddEmailResult {
  if (!facts.phoneConfirmed) return { ok: false, code: "phone_not_confirmed" };

  const email = normalizeEmail(input);
  if (!email) return { ok: false, code: "email_invalid" };

  if (facts.currentEmail !== null && normalizeEmail(facts.currentEmail) === email) {
    return { ok: false, code: "email_unchanged" };
  }

  return { ok: true, email };
}

/**
 * Which methods this account can actually use, for the account screen.
 *
 * `phone` is always present — it is how the account exists at all.
 */
export function availableSignInMethods(facts: {
  readonly emailConfirmed: boolean;
}): readonly SignInMethod[] {
  return facts.emailConfirmed ? ["phone", "email"] : ["phone"];
}

/**
 * What to do when a sign-in send comes back with an error.
 *
 * The reason this is a rule and not a branch at the call site:
 *
 *   AN UNKNOWN IDENTIFIER MUST LOOK EXACTLY LIKE A KNOWN ONE. `shouldCreateUser:
 *   false` means Supabase refuses on an identifier no account holds, and
 *   reporting that refusal answers the question "is there an account here?" for
 *   anyone who cares to ask. On this app that question is "does this person
 *   have HSV or HIV" — asked of an address a stranger already has, from a
 *   screen requiring no account of their own.
 *
 *   So the whole `no_such_account` family resolves to `pretend_sent`: the
 *   caller shows the code screen, the member types something, and it fails the
 *   same way a wrong code fails. Nothing distinguishes the two.
 *
 * A misconfigured provider is NOT in that family. Silently pretending there is
 * a code in flight when nothing was ever sent leaves every member stuck on a
 * screen waiting for a message that is not coming — which is how the liveness
 * step went unnoticed for as long as it did.
 */
export type SendFailureAction =
  /** Show the code screen anyway. The identifier holds no account. */
  | "pretend_sent"
  /** Our setup, not theirs. Say so. */
  | "not_configured"
  /** Too many sends. Ask them to wait. */
  | "rate_limited"
  /** Anything else. */
  | "failed";

const NO_SUCH_ACCOUNT: readonly string[] = [
  // What `shouldCreateUser: false` returns for an identifier with no account.
  "otp_disabled",
  "signup_disabled",
  "user_not_found",
];

const NOT_CONFIGURED: readonly string[] = [
  "email_provider_disabled",
  "phone_provider_disabled",
  "provider_disabled",
];

const RATE_LIMITED: readonly string[] = [
  "over_email_send_rate_limit",
  "over_sms_send_rate_limit",
  "over_request_rate_limit",
];

export function classifySendFailure(code: string | undefined | null): SendFailureAction {
  if (!code) return "failed";
  if (NO_SUCH_ACCOUNT.includes(code)) return "pretend_sent";
  if (NOT_CONFIGURED.includes(code)) return "not_configured";
  if (RATE_LIMITED.includes(code)) return "rate_limited";
  return "failed";
}
