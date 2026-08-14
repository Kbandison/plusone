/**
 * Phone OTP (§7.2, Decision #21) — the first step of onboarding.
 *
 * Supabase Auth talks to Twilio in production. This is the seam around it, so
 * the flow is buildable and testable before those credentials exist, and so the
 * phone step never has to be switched off to get work done. The step stays
 * required in the onboarding machine; only the provider changes.
 *
 * One structural property this module exists to guarantee:
 *
 *   THE CODE IS NEVER HANDED BACK TO THE CALLER. `OtpChallenge` has no field
 *   that could carry it. A provider that returned the code would let a client
 *   verify itself, which is the entire value of an out-of-band factor gone —
 *   so there is nowhere to put it.
 */

export type OtpProviderName = "supabase_twilio" | "stub";

/** An OTP send that is now in flight. Deliberately carries no code. */
export interface OtpChallenge {
  /** E.164, as stored on auth.users. */
  readonly phone: string;
  readonly provider: OtpProviderName;
  /** Epoch ms the code stops being accepted. */
  readonly expiresAt: number;
}

export interface OtpProvider {
  readonly name: OtpProviderName;
  send(phone: string, at: number): Promise<OtpChallenge>;
  verify(phone: string, code: string, at: number): Promise<boolean>;
}

/**
 * E.164: a leading +, a non-zero country digit, then up to fourteen more.
 * Validated at the boundary so a malformed number fails before it reaches the
 * SMS bill.
 */
const E164 = /^\+[1-9]\d{1,14}$/;

export function isValidE164(phone: string): boolean {
  return E164.test(phone);
}

/**
 * Strips the spaces, dashes and brackets people type, without inventing a
 * country code — guessing one silently sends a member's code to a stranger.
 */
export function normalizePhone(input: string): string | null {
  const stripped = input.replace(/[\s()\-.]/g, "");
  return isValidE164(stripped) ? stripped : null;
}

export const OTP_TTL_MS = 10 * 60 * 1000;

export interface StubOtpOptions {
  /** The code every stub challenge accepts. */
  readonly code?: string;
  /** Escape hatch for the test that asserts the production guard itself. */
  readonly allowInProduction?: boolean;
}

export const STUB_OTP_CODE = "000000";

/**
 * A deterministic OTP provider for development. No clock, no network — the
 * caller supplies `at`, so expiry is testable without waiting.
 *
 * It refuses to run in production for the same reason the liveness stub does: a
 * provider that accepts a fixed code is an open door, and shipping one by
 * accident has to be loud rather than quiet.
 */
export function createStubOtpProvider(options: StubOtpOptions = {}): OtpProvider {
  const { code = STUB_OTP_CODE, allowInProduction = false } = options;

  if (!allowInProduction && process.env["NODE_ENV"] === "production") {
    throw new Error(
      "The stub OTP provider accepts a fixed code and must never run in production. " +
        "Configure the Twilio provider in the Supabase dashboard and set OTP_PROVIDER=supabase_twilio.",
    );
  }

  const issued = new Map<string, number>();

  return {
    name: "stub",

    send(phone: string, at: number): Promise<OtpChallenge> {
      if (!isValidE164(phone)) return Promise.reject(new Error(`Not an E.164 number: ${phone}`));
      const expiresAt = at + OTP_TTL_MS;
      issued.set(phone, expiresAt);
      return Promise.resolve({ phone, provider: "stub", expiresAt });
    },

    verify(phone: string, candidate: string, at: number): Promise<boolean> {
      const expiresAt = issued.get(phone);
      if (expiresAt === undefined || at >= expiresAt) return Promise.resolve(false);
      return Promise.resolve(candidate === code);
    },
  };
}
