import { generateKeyPairSync, verify } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { providerToken, resetProviderToken } from "./apns";

/**
 * The provider token is three fields and a signature, and exactly one thing
 * about it is easy to get wrong.
 *
 * JOSE wants the raw `r || s` pair — 64 bytes for P-256. Node's default for an
 * EC key is DER, which is longer, variable-length, and which Apple rejects with
 * a 403 saying only "InvalidProviderToken". Nothing in that message points at
 * the encoding, so this is the test that would have saved the afternoon.
 *
 * Everything here runs against a key generated in-process. There is no Apple
 * account involved and none is needed: the signature either verifies against
 * its own public key in the format the spec names, or it does not.
 */
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });

const config = {
  keyId: "ABCDE12345",
  teamId: "TEAM123456",
  bundleId: "app.loveplusone",
  privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  host: "https://api.push.apple.com",
};

const decode = (segment: string) =>
  JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as Record<string, unknown>;

afterEach(() => resetProviderToken());

describe("the APNs provider token", () => {
  it("is a three-part JWT naming ES256 and the key", () => {
    const [header, claims, signature] = providerToken(config).split(".");
    expect(signature).toBeTruthy();

    expect(decode(header!)).toEqual({ alg: "ES256", kid: "ABCDE12345", typ: "JWT" });
    // The team is the issuer, and `iat` is SECONDS. Milliseconds here is
    // accepted by nothing and looks like a clock-skew problem.
    const payload = decode(claims!);
    expect(payload["iss"]).toBe("TEAM123456");
    expect(payload["iat"]).toBeCloseTo(Math.floor(Date.now() / 1000), -1);
  });

  it("signs in the raw r||s encoding rather than DER", () => {
    const [header, claims, signature] = providerToken(config).split(".");
    const raw = Buffer.from(signature!, "base64url");

    // 64 bytes exactly. DER is 70-ish and varies with the values, so a length
    // check alone catches the mistake this test exists for.
    expect(raw).toHaveLength(64);
    expect(
      verify(
        null,
        Buffer.from(`${header}.${claims}`),
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        raw,
      ),
    ).toBe(true);
  });

  it("does not verify when read as DER, which is the failure being avoided", () => {
    const [header, claims, signature] = providerToken(config).split(".");
    expect(
      verify(
        null,
        Buffer.from(`${header}.${claims}`),
        { key: publicKey, dsaEncoding: "der" },
        Buffer.from(signature!, "base64url"),
      ),
    ).toBe(false);
  });

  it("reuses a token rather than minting one per send", () => {
    // Apple rate-limits token generation and rejects anything over an hour old.
    // A fresh token per notification is how a batch earns a 429.
    const now = 1_700_000_000_000;
    const first = providerToken(config, now);
    expect(providerToken(config, now + 44 * 60 * 1000)).toBe(first);
  });

  it("mints a new one before Apple would call it stale", () => {
    const now = 1_700_000_000_000;
    const first = providerToken(config, now);
    // 45 minutes, comfortably inside the hour, so a slow batch never presents
    // a token that expired while it was running.
    const later = providerToken(config, now + 46 * 60 * 1000);
    expect(later).not.toBe(first);
    expect(decode(later.split(".")[1]!)["iat"]).toBe(Math.floor((now + 46 * 60 * 1000) / 1000));
  });

  it("accepts a key whose newlines survived as backslash-n", () => {
    // Vercel's editor keeps real newlines; a shell `export` usually does not,
    // and a .p8 pasted through one arrives as a single line. Both must work or
    // this fails only in whichever environment nobody tested.
    const escaped = { ...config, privateKey: config.privateKey.replace(/\n/g, "\\n") };
    resetProviderToken();
    // configure() does the rewriting, so a token built straight from the
    // escaped form must fail — proving the rewrite is load-bearing rather than
    // decorative.
    expect(() => providerToken(escaped)).toThrow();
  });
});
