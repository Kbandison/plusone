import { describe, expect, it } from "vitest";

import { applyDialCode } from "./dial-code-input";

/**
 * /sign-in takes a phone number OR an email in one field, so it cannot prefill
 * a "+1" the way /onboarding/phone does — that is a character every member
 * signing in with an address deletes first. The code arrives at the keystroke
 * that proves which one they brought.
 */
describe("the country code appears once the field stops being ambiguous", () => {
  const US = "+1";

  it("prefixes the first digit typed into an empty field", () => {
    expect(applyDialCode("", "7", US)).toBe("+17");
  });

  /** Paste is how a number reaches this field on a phone. */
  it("prefixes a whole number pasted into an empty field", () => {
    expect(applyDialCode("", "7183085353", US)).toBe("+17183085353");
  });

  it("leaves an address alone", () => {
    expect(applyDialCode("", "k", US)).toBeNull();
    expect(applyDialCode("", "kbandison@gmail.com", US)).toBeNull();
  });

  /**
   * The rest of the number is typed without interference. Without the
   * from-empty rule this fires on every keystroke and builds "+1+1+17...".
   */
  it("does nothing once the field has anything in it", () => {
    expect(applyDialCode("+17", "+171", US)).toBeNull();
    expect(applyDialCode("7", "71", US)).toBeNull();
  });

  it("does not double a code the member typed themselves", () => {
    expect(applyDialCode("", "+447911123456", US)).toBeNull();
  });

  /** Off Vercel, or a request Vercel could not place. */
  it("suggests nothing when there is nothing to suggest", () => {
    expect(applyDialCode("", "7", "")).toBeNull();
  });

  /** Clearing the field and starting again is a fresh start, not a lockout. */
  it("offers the code again after the member empties the field", () => {
    expect(applyDialCode("", "2", "+44")).toBe("+442");
  });
});
