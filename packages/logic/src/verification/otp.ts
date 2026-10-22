/**
 * Phone OTP (§7.2, Decision #21) — the first step of onboarding.
 *
 * Supabase Auth talks to Twilio in production — Verify or plain Programmable
 * Messaging, whichever the dashboard is set to; this app cannot tell and does
 * not need to. This is the seam around that, so
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

export type OtpProviderName = "supabase_twilio" | "supabase_twilio_verify" | "stub";

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

/**
 * Area codes inside +1 that are NOT the US or Canada.
 *
 * The North American Numbering Plan carries about twenty Caribbean and Atlantic
 * countries alongside the two it is named for, and to a carrier they are
 * international destinations — which is exactly what SMS pumping wants. Listed
 * by country so a reader can check it against the NANPA table.
 *
 * US territories (Puerto Rico, the USVI, Guam, the Northern Marianas, American
 * Samoa) are deliberately absent: they are the US.
 */
export const NANP_OUTSIDE_US_CANADA: readonly string[] = [
  "242", // Bahamas
  "246", // Barbados
  "264", // Anguilla
  "268", // Antigua and Barbuda
  "284", // British Virgin Islands
  "345", // Cayman Islands
  "441", // Bermuda
  "473", // Grenada
  "649", // Turks and Caicos
  "658", // Jamaica
  "664", // Montserrat
  "721", // Sint Maarten
  "758", // Saint Lucia
  "767", // Dominica
  "784", // Saint Vincent and the Grenadines
  "809", // Dominican Republic
  "829", // Dominican Republic
  "849", // Dominican Republic
  "868", // Trinidad and Tobago
  "869", // Saint Kitts and Nevis
  "876", // Jamaica
  "900", // premium-rate, not a place
];

const NANP = /^\+1(\d{3})\d{7}$/;

/**
 * Whether we will pay to text this number: the US and Canada, and nowhere else.
 *
 * ── why this exists ─────────────────────────────────────────────────────────
 *
 * Every send is a paid message, and from 2026-10-20 a bot typed Belarus (+375)
 * numbers into the signup form about thirty an hour — SMS pumping, where the
 * carrier at the far end splits the fee with whoever generated the traffic. 134
 * codes later the Twilio balance was gone, about $40, and not one was ever
 * typed back. Every metro this app serves is in the US, and every confirmed
 * member on that date had a +1 number, so a number outside it has nobody
 * behind it we could serve.
 *
 * ── a denylist inside +1, on purpose ────────────────────────────────────────
 *
 * The alternative is an allowlist of US and Canadian area codes, and that is
 * the version that hurts somebody real: new overlays are added several times a
 * year, and a stale allowlist refuses a genuine member silently, in a city we
 * have never heard from. The foreign NANP list barely moves.
 *
 * Shape only past the area code. Twilio rejects an unroutable number before
 * sending, for free, so this does not try to be a full NANP validator — and
 * the 555 numbers the seeds and the App Review account use have to pass.
 *
 * This is the app's half. Twilio's Geo Permissions is the other, and is the one
 * that also holds for a request that never came through this code.
 */
export function isSmsDestinationAllowed(phone: string): boolean {
  const match = NANP.exec(phone);
  if (!match) return false;
  return !NANP_OUTSIDE_US_CANADA.includes(match[1] as string);
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
        "Configure a phone provider in the Supabase dashboard and set OTP_PROVIDER to " +
        "supabase_twilio_verify or supabase_twilio.",
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
