import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { dialCodeForCountry } from "./dial-code";

describe("dialCodeForCountry", () => {
  it.each([
    ["US", "+1"],
    ["CA", "+1"],
    ["GB", "+44"],
    ["AU", "+61"],
    ["DE", "+49"],
    ["NG", "+234"],
    ["IN", "+91"],
    ["BR", "+55"],
  ])("%s suggests %s", (country, expected) => {
    expect(dialCodeForCountry(country)).toBe(expected);
  });

  /**
   * Empty, not a default. Falling back to "+1" would put a US code in front of
   * a number belonging to somebody the header could not place — which is the
   * exact failure `normalizePhone` refuses to allow on the server, moved into
   * the field where the member is less likely to notice it.
   */
  it.each([null, undefined, "", "ZZ", "XX", "not-a-country"])(
    "suggests nothing for %s",
    (country) => {
      expect(dialCodeForCountry(country)).toBe("");
    },
  );
});

describe("the suggestion never becomes an assumption", () => {
  const APP = join(import.meta.dirname, "../app");
  const form = readFileSync(join(APP, "onboarding/phone/phone-form.tsx"), "utf8");
  const signIn = readFileSync(join(APP, "sign-in/sign-in-form.tsx"), "utf8");
  const otp = readFileSync(
    join(import.meta.dirname, "../../../../packages/logic/src/verification/otp.ts"),
    "utf8",
  );

  /**
   * defaultValue, never value. An uncontrolled input the member types over
   * costs them one backspace when the guess is wrong — and on this app, where
   * members have more reason than most to be behind a VPN, it will be wrong.
   */
  it("prefills the phone field without controlling it", () => {
    expect(form).toMatch(/defaultValue=\{suggestedDialCode\}/);
    expect(form).not.toMatch(/value=\{suggestedDialCode\}/);
  });

  /**
   * /sign-in takes a number OR an email in ONE field, so it must never carry a
   * standing prefill: a "+1" sitting there on arrival is a character every
   * member signing in with an address deletes first, and that is the path most
   * members use after their first day.
   *
   * It still offers the code — at the first keystroke that proves this is a
   * number, which is what applyDialCode decides. The rule this test protects is
   * not "no country code here", it is "nothing in the field until the member
   * has said which kind of thing they are typing".
   */
  it("never prefills the sign-in field, which also takes an email", () => {
    expect(signIn).not.toMatch(/defaultValue=\{suggestedDialCode\}/);
    expect(signIn).not.toMatch(/value=\{suggestedDialCode\}/);
  });

  it("offers the code on the sign-in field only through the from-empty rule", () => {
    expect(signIn).toMatch(/applyDialCode\(before\.current, input\.value, suggestedDialCode\)/);
  });

  /**
   * The server-side guard is untouched. A prefilled visible field and an
   * invented country code are different things, and only the first is safe.
   */
  it("leaves normalizePhone refusing to invent a country code", () => {
    expect(otp).toMatch(/without inventing a\s*\n?\s*\*?\s*country code/);
    expect(otp).toMatch(/return isValidE164\(stripped\) \? stripped : null;/);
  });
});
