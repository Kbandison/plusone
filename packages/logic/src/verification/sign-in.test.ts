import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { normalizePhone } from "./otp";
import {
  MAX_EMAIL_LENGTH,
  availableSignInMethods,
  canAddSignInEmail,
  classifyIdentifier,
  classifySendFailure,
  normalizeEmail,
} from "./sign-in";

describe("normalizeEmail", () => {
  it.each([
    ["kevin@example.com", "kevin@example.com"],
    ["  kevin@example.com  ", "kevin@example.com"],
    ["Kevin@Example.COM", "kevin@example.com"],
    // Plus-addressing is how a lot of people file mail. Rejecting it locks
    // members out of an address they use every day.
    ["kevin+plusone@example.com", "kevin+plusone@example.com"],
    ["k.b.andison@mail.example.co.uk", "k.b.andison@mail.example.co.uk"],
  ])("accepts %s", (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });

  it.each([
    ["", "empty"],
    ["kevin", "no @"],
    ["kevin@", "no domain"],
    ["@example.com", "no local part"],
    ["kevin@example", "undotted domain"],
    ["kevin@@example.com", "two @"],
    ["kev in@example.com", "whitespace inside"],
    ["kevin@exa mple.com", "whitespace in the domain"],
  ])("rejects %s (%s)", (input) => {
    expect(normalizeEmail(input)).toBeNull();
  });

  it("rejects an address past the RFC 5321 length", () => {
    const local = "k".repeat(MAX_EMAIL_LENGTH);
    expect(normalizeEmail(`${local}@example.com`)).toBeNull();
  });
});

describe("classifyIdentifier — one field, either credential", () => {
  it("reads an address as email", () => {
    expect(classifyIdentifier("Kevin@Example.com", normalizePhone)).toEqual({
      method: "email",
      value: "kevin@example.com",
    });
  });

  it("reads a number as phone, punctuation and all", () => {
    expect(classifyIdentifier(" +1 (555) 123-4567 ", normalizePhone)).toEqual({
      method: "phone",
      value: "+15551234567",
    });
  });

  it("refuses to guess at input that is neither", () => {
    expect(classifyIdentifier("kevin", normalizePhone)).toBeNull();
    expect(classifyIdentifier("5551234567", normalizePhone)).toBeNull();
    expect(classifyIdentifier("   ", normalizePhone)).toBeNull();
  });

  it("never sends a malformed address down the phone route", () => {
    // The @ decides the branch, so a typo'd address must fail as an address
    // rather than fall through and be normalized as a number.
    expect(classifyIdentifier("kevin@", normalizePhone)).toBeNull();
  });
});

describe("canAddSignInEmail — the phone stays the anchor", () => {
  const CONFIRMED = { phoneConfirmed: true, currentEmail: null } as const;

  it("adds an address to a phone-confirmed account", () => {
    expect(canAddSignInEmail("kevin@example.com", CONFIRMED)).toEqual({
      ok: true,
      email: "kevin@example.com",
    });
  });

  /**
   * The property the whole design rests on. If this ever passes, an email has
   * become a way to reach an account no phone number ever made — and with it, a
   * banned member is one free address away from coming back.
   */
  it("refuses on an account with no confirmed phone", () => {
    expect(canAddSignInEmail("kevin@example.com", { ...CONFIRMED, phoneConfirmed: false })).toEqual(
      {
        ok: false,
        code: "phone_not_confirmed",
      },
    );
  });

  it("checks the phone before it checks the address", () => {
    // Otherwise a caller could tell a phoneless account apart by which refusal
    // it got, and the refusal that matters would be reachable only by typing a
    // valid address.
    expect(canAddSignInEmail("nonsense", { ...CONFIRMED, phoneConfirmed: false })).toEqual({
      ok: false,
      code: "phone_not_confirmed",
    });
  });

  it("refuses an address it cannot send to", () => {
    expect(canAddSignInEmail("kevin@", CONFIRMED)).toEqual({
      ok: false,
      code: "email_invalid",
    });
  });

  it("refuses the address already on the account, however it is cased", () => {
    expect(
      canAddSignInEmail("KEVIN@example.com", {
        phoneConfirmed: true,
        currentEmail: "kevin@example.com",
      }),
    ).toEqual({ ok: false, code: "email_unchanged" });
  });

  it("allows replacing one address with another", () => {
    expect(
      canAddSignInEmail("new@example.com", {
        phoneConfirmed: true,
        currentEmail: "old@example.com",
      }),
    ).toEqual({ ok: true, email: "new@example.com" });
  });

  /**
   * Decision #21: "Appeal path never locked behind the thing being appealed."
   * An account you cannot sign into is an appeal you cannot file.
   */
  it("does not consult verification status at all", () => {
    // There is no status parameter to pass. If one is ever added, this fails
    // rather than quietly gaining a way to lock a flagged member out.
    expect(canAddSignInEmail.length).toBe(2);
  });
});

describe("availableSignInMethods", () => {
  it("always offers phone", () => {
    expect(availableSignInMethods({ emailConfirmed: false })).toEqual(["phone"]);
  });

  it("offers both once an address is confirmed", () => {
    expect(availableSignInMethods({ emailConfirmed: true })).toEqual(["phone", "email"]);
  });
});

describe("classifySendFailure — an unknown identifier tells no tales", () => {
  /**
   * The enumeration property. Each of these is what Supabase returns when
   * `shouldCreateUser: false` meets an identifier no account holds. If any of
   * them ever reaches the member as its own message, the sign-in screen becomes
   * a lookup service for who is on an HSV/HIV app.
   */
  it.each(["otp_disabled", "signup_disabled", "user_not_found"])(
    "%s is indistinguishable from a successful send",
    (code) => {
      expect(classifySendFailure(code)).toBe("pretend_sent");
    },
  );

  it.each(["email_provider_disabled", "phone_provider_disabled", "provider_disabled"])(
    "%s is reported as our setup problem",
    (code) => {
      expect(classifySendFailure(code)).toBe("not_configured");
    },
  );

  it.each(["over_email_send_rate_limit", "over_sms_send_rate_limit", "over_request_rate_limit"])(
    "%s asks the member to wait",
    (code) => {
      expect(classifySendFailure(code)).toBe("rate_limited");
    },
  );

  /**
   * Confirmed against the live provider: sending to a number Twilio cannot
   * route returns `sms_send_failed`, carrying Twilio error 60200 "Invalid
   * parameter To". That is not transient, so "try again in a moment" is advice
   * that can never work — and it must NOT pretend, because it says nothing
   * about whether an account exists and would strand somebody on a code screen
   * no code is coming to.
   */
  it.each(["sms_send_failed", "phone_number_invalid"])(
    "%s tells them to check the number",
    (code) => {
      expect(classifySendFailure(code)).toBe("undeliverable");
    },
  );

  it("does not pretend for an error it does not recognise", () => {
    // Pretending by default would hide a real outage behind a code screen.
    expect(classifySendFailure("unexpected_failure")).toBe("failed");
    expect(classifySendFailure(undefined)).toBe("failed");
    expect(classifySendFailure(null)).toBe("failed");
    expect(classifySendFailure("")).toBe("failed");
  });

  /**
   * Guards against the codes drifting out from under us. These are read from
   * @supabase/auth-js's own ErrorCode union; if a Supabase upgrade renames one,
   * this fails here rather than silently turning enumeration back on.
   */
  it("every code it classifies is a real Supabase ErrorCode", () => {
    const union = readFileSync(
      fileURLToPath(
        new URL(
          "../../../../node_modules/@supabase/auth-js/dist/module/lib/error-codes.d.ts",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    for (const code of [
      "sms_send_failed",
      "otp_disabled",
      "signup_disabled",
      "user_not_found",
      "email_provider_disabled",
      "phone_provider_disabled",
      "provider_disabled",
      "over_email_send_rate_limit",
      "over_sms_send_rate_limit",
      "over_request_rate_limit",
    ]) {
      expect(union, `${code} is no longer a Supabase ErrorCode`).toContain(`'${code}'`);
    }
  });
});
