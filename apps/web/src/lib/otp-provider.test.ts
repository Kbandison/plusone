import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseServerEnv } from "@plusone/config";

const SRC = join(import.meta.dirname, "..");

function files(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files(path, acc);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) acc.push(path);
  }
  return acc;
}

const VALID = {
  NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  NEXT_PUBLIC_SITE_URL: "https://loveplusone.app",
  NEXT_PUBLIC_APP_URL: "https://app.loveplusone.app",
  SUPABASE_SECRET_KEY: "sb_secret_x",
  STRIPE_SECRET_KEY: "sk_live_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  STRIPE_PRICE_PREMIUM_1MO: "price_1",
  STRIPE_PRICE_PREMIUM_3MO: "price_2",
  STRIPE_PRICE_PREMIUM_6MO: "price_3",
  RESEND_API_KEY: "re_x",
  LIVENESS_PROVIDER: "stub",
  CRON_SECRET: "0123456789012345678901234567890123456789",
};

describe("either Twilio product may be live", () => {
  /**
   * A2P brand and campaign review can take weeks, and Verify skips it entirely
   * by sending over Twilio's own registered infrastructure. Plain Programmable
   * Messaging is cheaper per message once volume clears about 84 verifications
   * a month. Both are legitimate answers at different sizes, so both are legal
   * here and switching is a dashboard change with no deploy.
   */
  it.each(["supabase_twilio", "supabase_twilio_verify", "stub"])("%s is accepted", (provider) => {
    expect(parseServerEnv({ ...VALID, OTP_PROVIDER: provider }).OTP_PROVIDER).toBe(provider);
  });

  /**
   * A provider that does not exist falls back rather than throwing, and the
   * fallback direction is what matters: everything except "stub" closes the
   * development sign-in, so a typo leaves that door shut.
   *
   * It used to throw, and that threw out of parseServerEnv — which every server
   * route calls — so one wrong string in the deployment environment 500'd the
   * phone step, the liveness step and all five crons together, from a variable
   * that decides nothing.
   */
  it("falls back safely for a provider that does not exist", () => {
    const parsed = parseServerEnv({ ...VALID, OTP_PROVIDER: "twilio_direct" });
    expect(parsed.OTP_PROVIDER).toBe("supabase_twilio_verify");
    expect(parsed.OTP_PROVIDER, "a typo must never open the dev sign-in").not.toBe("stub");
  });
});

describe("the app cannot tell the two apart", () => {
  /**
   * THE PROPERTY THAT MAKES SUPPORTING BOTH FREE.
   *
   * signInWithOtp and verifyOtp are identical calls for Verify and for plain
   * Programmable Messaging, because Supabase owns the provider seam and talks
   * to Twilio on our behalf. OTP_PROVIDER exists so the stub guard can refuse
   * when a real provider is live — nothing else.
   *
   * The moment any code asks WHICH real provider is live, switching stops being
   * a dashboard change and starts being a deploy, and the two paths start
   * drifting. Every comparison in the app must be against "stub".
   */
  it("compares OTP_PROVIDER only against stub", () => {
    const offenders: string[] = [];

    for (const file of files(SRC)) {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

      for (const match of code.matchAll(/OTP_PROVIDER"?\]?\s*(?:===|!==)\s*"([^"]+)"/g)) {
        if (match[1] !== "stub") offenders.push(`${file.replace(SRC, "src")}: ${match[1]}`);
      }
      // The guard takes the value as an argument; same rule applies there.
      for (const match of code.matchAll(/otpProvider\s*(?:===|!==)\s*"([^"]+)"/g)) {
        if (match[1] !== "stub") offenders.push(`${file.replace(SRC, "src")}: ${match[1]}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
