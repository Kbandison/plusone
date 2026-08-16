import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { verification } from "@plusone/logic";

/**
 * The two halves of "your phone is verified" have to mean the same thing.
 *
 * They did not. The onboarding resolver reads `auth.users.phone_confirmed_at`,
 * and the liveness step reads `profiles.verification_status` — and nothing ever
 * wrote the second one. So every member arrived at liveness with a profile
 * still marked 'unverified', `start_liveness` refused with phone_not_verified,
 * and the screen reported "the check is unavailable right now".
 *
 * Liveness had therefore never worked, for anyone, and it looked like a
 * provider problem — which is why it survived a liveness adapter, a state
 * machine, a storage bucket, a purge job and an admin review queue all being
 * built on top of it.
 *
 * Two things are asserted, because the bug needed both to be true: the status
 * the reducer demands, and the status the app writes.
 */

const APP = join(import.meta.dirname, "../app");

describe("phone verification agrees with itself", () => {
  it("start_liveness accepts exactly the status the phone step writes", () => {
    const afterOtp: verification.VerificationState = {
      ...verification.INITIAL_STATE,
      status: "phone_verified",
    };
    const started = verification.transition(afterOtp, { type: "start_liveness", at: 1 });
    expect(started.ok, "the reducer no longer accepts phone_verified").toBe(true);
  });

  it("refuses from unverified, which is what a fresh profile row has", () => {
    // The trigger creates profiles at 'unverified'. If nothing moves them on,
    // this is the refusal every member hit.
    const fresh: verification.VerificationState = {
      ...verification.INITIAL_STATE,
      status: "unverified",
    };
    const started = verification.transition(fresh, { type: "start_liveness", at: 1 });
    expect(started.ok).toBe(false);
    if (!started.ok) expect(started.code).toBe("phone_not_verified");
  });

  it.each([
    ["the real OTP path", "onboarding/phone/actions.ts"],
    ["the development sign-in", "dev/sign-in/actions.ts"],
  ])("%s records phone_verified on the profile", (_label, relative) => {
    const source = readFileSync(join(APP, relative), "utf8");
    expect(
      source,
      `${relative} completes phone verification without recording it on the profile`,
    ).toMatch(/verification_status:\s*"phone_verified"/);
    // And only ever forwards — never past a member who is already further on.
    expect(source).toMatch(/\.eq\("verification_status",\s*"unverified"\)/);
  });

  it("tells a member the actual reason rather than blaming the provider", () => {
    const source = readFileSync(join(APP, "onboarding/liveness/actions.ts"), "utf8");
    expect(source).toMatch(/phone_not_verified/);
    expect(source).toMatch(/phoneFirst/);
  });
});
