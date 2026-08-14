import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  OTP_TTL_MS,
  STUB_OTP_CODE,
  createStubOtpProvider,
  isValidE164,
  normalizePhone,
} from "./otp";

const AT = 1_700_000_000_000;
const PHONE = "+15551234567";

describe("E.164 validation", () => {
  it.each(["+15551234567", "+447700900123", "+81312345678", "+3312345678"])(
    "accepts %s",
    (phone) => {
      expect(isValidE164(phone)).toBe(true);
    },
  );

  it.each([
    ["", "empty"],
    ["15551234567", "no leading plus"],
    ["+05551234567", "zero country digit"],
    ["+1555123456789012", "too long"],
    ["+1", "too short"],
    ["+1555 123 4567", "unstripped spaces"],
    ["+1555abc4567", "letters"],
  ])("rejects %s (%s)", (phone) => {
    expect(isValidE164(phone)).toBe(false);
  });
});

describe("normalisation", () => {
  it.each(["+1 (555) 123-4567", "+1-555-123-4567", "+1 555 123 4567", "+1.555.123.4567"])(
    "strips the punctuation people type: %s",
    (input) => {
      expect(normalizePhone(input)).toBe(PHONE);
    },
  );

  // Guessing a country code silently sends a member's code to a stranger.
  it("does not invent a country code", () => {
    expect(normalizePhone("5551234567")).toBeNull();
    expect(normalizePhone("(555) 123-4567")).toBeNull();
  });

  it("returns null rather than a half-cleaned string", () => {
    expect(normalizePhone("not a phone")).toBeNull();
  });
});

describe("the stub provider", () => {
  it("accepts the fixed code before expiry", async () => {
    const provider = createStubOtpProvider();
    await provider.send(PHONE, AT);
    expect(await provider.verify(PHONE, STUB_OTP_CODE, AT + 1000)).toBe(true);
  });

  it("rejects the wrong code", async () => {
    const provider = createStubOtpProvider();
    await provider.send(PHONE, AT);
    expect(await provider.verify(PHONE, "999999", AT + 1000)).toBe(false);
  });

  it("rejects a code for a number that was never sent one", async () => {
    const provider = createStubOtpProvider();
    expect(await provider.verify(PHONE, STUB_OTP_CODE, AT)).toBe(false);
  });

  it("expires the code", async () => {
    const provider = createStubOtpProvider();
    await provider.send(PHONE, AT);
    expect(await provider.verify(PHONE, STUB_OTP_CODE, AT + OTP_TTL_MS - 1)).toBe(true);
    expect(await provider.verify(PHONE, STUB_OTP_CODE, AT + OTP_TTL_MS)).toBe(false);
  });

  it("keeps challenges separate per number", async () => {
    const provider = createStubOtpProvider();
    await provider.send(PHONE, AT);
    expect(await provider.verify("+15559998888", STUB_OTP_CODE, AT + 1)).toBe(false);
  });

  it("refuses a number that is not E.164", async () => {
    const provider = createStubOtpProvider();
    await expect(provider.send("5551234567", AT)).rejects.toThrow(/E\.164/);
  });

  it("takes a configured code", async () => {
    const provider = createStubOtpProvider({ code: "123456" });
    await provider.send(PHONE, AT);
    expect(await provider.verify(PHONE, "123456", AT + 1)).toBe(true);
    expect(await provider.verify(PHONE, STUB_OTP_CODE, AT + 1)).toBe(false);
  });

  it("reads no clock — expiry comes from the caller", async () => {
    const provider = createStubOtpProvider();
    const challenge = await provider.send(PHONE, AT);
    expect(challenge.expiresAt).toBe(AT + OTP_TTL_MS);
  });

  it("refuses to run in production", () => {
    const previous = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "production";
    try {
      expect(() => createStubOtpProvider()).toThrow(/never run in production/);
    } finally {
      process.env["NODE_ENV"] = previous;
    }
  });
});

// A returned code would let a client verify itself, which is the whole value of
// an out-of-band factor gone.
describe("structural guarantees", () => {
  const source = readFileSync(fileURLToPath(new URL("./otp.ts", import.meta.url)), "utf8");

  it("gives the challenge nowhere to carry the code", () => {
    const block = /export interface OtpChallenge \{([\s\S]*?)\n\}/.exec(source)?.[1];
    expect(block).toBeDefined();
    const fields = [...(block ?? "").matchAll(/^\s*readonly (\w+)/gm)].map((m) => m[1]).sort();
    expect(fields).toEqual(["expiresAt", "phone", "provider"]);
  });

  it("returns a challenge with no code at runtime either", async () => {
    const provider = createStubOtpProvider();
    const challenge = await provider.send(PHONE, AT);
    expect(Object.keys(challenge).sort()).toEqual(["expiresAt", "phone", "provider"]);
    expect(JSON.stringify(challenge)).not.toContain(STUB_OTP_CODE);
  });
});
