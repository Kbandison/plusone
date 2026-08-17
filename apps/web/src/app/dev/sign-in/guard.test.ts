import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { devSignInAllowed } from "./guard";

/**
 * The development sign-in is a door into any account without an SMS.
 *
 * It exists because the stub OTP provider in packages/logic was never wired to
 * anything, so there was no way to open the app at all without a live Twilio
 * account — a wait on business verification that the entire build sits behind.
 *
 * These are the tests that matter more than the feature.
 */
describe("the development sign-in guard", () => {
  it("refuses in production, whatever the provider says", () => {
    expect(devSignInAllowed("production", "stub")).toBe(false);
    expect(devSignInAllowed("production", "supabase_twilio")).toBe(false);
  });

  it("refuses whenever a real OTP provider is configured", () => {
    expect(devSignInAllowed("development", "supabase_twilio")).toBe(false);
    expect(devSignInAllowed("test", "supabase_twilio")).toBe(false);
    expect(devSignInAllowed(undefined, "supabase_twilio")).toBe(false);
  });

  it("allows only the one combination it is for", () => {
    expect(devSignInAllowed("development", "stub")).toBe(true);
  });

  it("needs both conditions, so one mis-set variable is not enough", () => {
    // NODE_ENV alone would be one typo away from open on a real host, and
    // OTP_PROVIDER alone would open the moment a stub build was deployed.
    const combinations = [
      ["production", "stub"],
      ["development", "supabase_twilio"],
      ["production", "supabase_twilio"],
    ] as const;
    for (const [nodeEnv, provider] of combinations) {
      expect(devSignInAllowed(nodeEnv, provider), `${nodeEnv} + ${provider}`).toBe(false);
    }
  });

  it("is checked by the page as well as the action", () => {
    // Different things: the action stops a POST, the page stops the route from
    // appearing to exist at all. Losing either is a silent downgrade.
    const dir = import.meta.dirname;
    expect(readFileSync(join(dir, "page.tsx"), "utf8")).toMatch(/devSignInAllowed/);
    expect(readFileSync(join(dir, "actions.ts"), "utf8")).toMatch(/devSignInAllowed/);
  });
});

describe("every action in this file is behind the guard", () => {
  const source = readFileSync(join(import.meta.dirname, "actions.ts"), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  /**
   * This file is a door into any account. It had one action and now has two,
   * and the second was written by pattern-matching the first — which is exactly
   * how the third one forgets. A dev action without this check is a production
   * hole, so the count is asserted rather than eyeballed.
   */
  it("guards as many times as it exports", () => {
    const exported = [...code.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
    const guarded = [...code.matchAll(/devSignInAllowed\(/g)];

    expect(exported.length, "no actions found — did the file move?").toBeGreaterThan(0);
    expect(guarded.length, `exports: ${exported.join(", ")}`).toBe(exported.length);
  });

  it("checks both conditions, never just one", () => {
    // NODE_ENV alone is one mis-set variable from open; OTP_PROVIDER alone
    // opens the moment a stub build reaches a real host.
    for (const call of code.matchAll(/devSignInAllowed\(([^)]*)\)/g)) {
      expect(call[1]).toContain("NODE_ENV");
      expect(call[1]).toContain("OTP_PROVIDER");
    }
  });
});
