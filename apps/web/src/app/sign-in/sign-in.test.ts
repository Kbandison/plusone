import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

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
