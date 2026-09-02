import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { OTP } from "@plusone/config";

/**
 * Two one-line properties, guarded at the surface.
 *
 * The logic package proves the rules; this proves the screen still asks for
 * them. Both of these are a single option or a single branch, and both fail
 * silently when removed — the screen keeps working, it just stops being safe.
 */
const source = readFileSync(fileURLToPath(new URL("./actions.ts", import.meta.url)), "utf8");

/** Comments describe these properties at length; strip them before matching. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("/sign-in can never mint an account", () => {
  /**
   * Without this, Supabase creates a user for any unrecognised identifier — and
   * email becomes a registration path by accident, which is the one thing this
   * design exists to prevent. A banned member would be one free address from
   * being back.
   */
  it("passes shouldCreateUser: false on both branches", () => {
    const occurrences = code.match(/shouldCreateUser:\s*false/g) ?? [];
    expect(occurrences.length, "one for the email branch, one for the phone branch").toBe(2);
  });

  it("has exactly two signInWithOtp calls, so neither branch is unguarded", () => {
    const calls = code.match(/signInWithOtp\(/g) ?? [];
    expect(calls.length).toBe(2);
  });
});

describe("/sign-in answers nothing about who has an account", () => {
  /**
   * The enumeration property. If a "no such account" refusal ever reaches the
   * member as its own message, this screen becomes a way for anyone — with no
   * account of their own — to test whether a given phone number or email
   * belongs to someone on an app for people with HSV or HIV.
   */
  it("routes send failures through classifySendFailure rather than reading the message", () => {
    expect(code).toMatch(/classifySendFailure\(error\.code\)/);
    // Reporting the provider's own text would leak the refusal verbatim.
    expect(code).not.toMatch(/error\.message/);
  });

  it("returns the code screen on the pretend_sent branch", () => {
    // `sentTo` set with no error is exactly what a real send returns, which is
    // what makes the two indistinguishable.
    expect(code).toMatch(/case "pretend_sent":\s*return \{ error: null, sentTo: identifier \};/);
  });

  it("never advances verification_status", () => {
    // Signing back in re-proves nothing. Only the phone step may write this.
    expect(code).not.toMatch(/verification_status/);
  });
});

describe("the code screen does not echo the identifier back", () => {
  const form = readFileSync(fileURLToPath(new URL("./sign-in-form.tsx", import.meta.url)), "utf8");

  /**
   * Naming where the code went is the ordinary courtesy and the one thing this
   * screen must not do — reaching it proves nothing about whether an account
   * exists, so repeating the address a stranger typed would confirm it.
   */
  it("renders the identifier only into the hidden resend field", () => {
    const visible = form.replace(/<input type="hidden"[\s\S]*?\/>/g, "");
    expect(visible).not.toMatch(/\{sent\.sentTo\?\.value\}/);
    expect(visible).not.toMatch(/\{sent\.sentTo\.value\}/);
  });
});

/**
 * The code box has to fit the longest code any channel sends.
 *
 * It was `maxLength={6}` while Supabase's email OTP is EIGHT digits, so the box
 * silently truncated every emailed code to its first six characters. The member
 * typed exactly what they were sent, the input kept six of it, and Supabase
 * refused a token that was never wrong — with no error naming the real cause.
 *
 * Nothing server-side checks a length (`actions.ts` forwards the token to
 * verifyOtp untouched), so there was no second place this could have been
 * caught. Found 2026-09-01 by Kevin reading a delivered email, which no test
 * here can do.
 *
 * Pinned as "not a literal" rather than "equals 8": the point is that the value
 * tracks the config, so changing Supabase's Email OTP Length is a one-line
 * change here instead of a silent truncation again.
 */
describe("the sign-in code box fits the code that was sent", () => {
  const form = readFileSync(fileURLToPath(new URL("./sign-in-form.tsx", import.meta.url)), "utf8");

  it("sizes itself from config rather than a literal", () => {
    expect(form).toMatch(/maxLength=\{OTP\.codeMaxLength\}/);
    expect(form).not.toMatch(/maxLength=\{\d+\}/);
  });

  it("allows at least the eight digits Supabase sends by email", () => {
    expect(OTP.codeMaxLength).toBeGreaterThanOrEqual(8);
  });
});

describe("signing out ends this session and no other", () => {
  /**
   * `signOut()` with no options defaults to GLOBAL in supabase-js, which
   * revokes every session on every device. The action's own docblock said it
   * "ends the session and touches nothing else" — which the call made false.
   *
   * On this app the link sits at the bottom of every onboarding screen so
   * somebody who has just handed their phone over can reach it, and that member
   * is thinking about the phone in their hand. Taking their laptop with it is a
   * surprise in the direction of losing access.
   */
  const action = readFileSync(
    fileURLToPath(new URL("../app/settings/sign-out.ts", import.meta.url)),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("finds the call at all", () => {
    expect(action).toMatch(/auth\.signOut\(/);
  });

  it("asks for local scope rather than taking the default", () => {
    expect(action).toMatch(/auth\.signOut\(\{ scope: "local" \}\)/);
    // The bare CALL is the bug — anchored on `auth.` so the function's own
    // declaration, `export async function signOut()`, does not match it. The
    // first version of this assertion failed on the code it was written for.
    expect(action).not.toMatch(/auth\.signOut\(\)/);
  });
});
