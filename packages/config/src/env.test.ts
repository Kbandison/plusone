import { describe, expect, it } from "vitest";

import { parseClientEnv, parseServerEnv } from "./env";

const VALID_CLIENT = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc123",
  NEXT_PUBLIC_SITE_URL: "https://yourplusone.com",
  NEXT_PUBLIC_APP_URL: "https://app.yourplusone.com",
};

const VALID_SERVER = {
  SUPABASE_SECRET_KEY: "sb_secret_abc123",
  STRIPE_SECRET_KEY: "sk_live_abc123",
  STRIPE_WEBHOOK_SECRET: "whsec_abc123",
  STRIPE_PRICE_PREMIUM_1MO: "price_1",
  STRIPE_PRICE_PREMIUM_3MO: "price_3",
  STRIPE_PRICE_PREMIUM_6MO: "price_6",
  RESEND_API_KEY: "re_abc123",
  OTP_PROVIDER: "stub",
  LIVENESS_PROVIDER: "stub",
  AWS_REGION: "us-west-2",
  AWS_ACCESS_KEY_ID: "AKIAEXAMPLEEXAMPLE",
  AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMIexampleKEYexampleEXAMPLEKEY",
  CRON_SECRET: "x".repeat(32),
};

describe("client env", () => {
  it("accepts a well-formed environment", () => {
    expect(parseClientEnv(VALID_CLIENT)).toEqual(VALID_CLIENT);
  });

  // The Supabase dashboard shows the Project URL and the RESTful endpoint
  // together. Pasting the second one leaves every request 404ing with
  // "Invalid path specified in request URL" — a long way from the cause.
  it("rejects the RESTful endpoint in place of the Project URL", () => {
    expect(() =>
      parseClientEnv({
        ...VALID_CLIENT,
        NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co/rest/v1/",
      }),
    ).toThrow(/must be an origin with no path/);
  });

  it("rejects any other path, query or fragment", () => {
    for (const suffix of ["/auth/v1", "?apikey=x", "#fragment"]) {
      expect(() =>
        parseClientEnv({
          ...VALID_CLIENT,
          NEXT_PUBLIC_SUPABASE_URL: `https://abcdefghijklmnop.supabase.co${suffix}`,
        }),
      ).toThrow(/Invalid client environment/);
    }
  });

  // Copying from a browser bar picks up a trailing slash. That is not a
  // mistake worth failing a deploy over, but it must not survive into string
  // concatenation either, or links come out with a doubled slash.
  it("normalises a lone trailing slash away", () => {
    const parsed = parseClientEnv({
      ...VALID_CLIENT,
      NEXT_PUBLIC_SITE_URL: "https://yourplusone.com/",
    });
    expect(parsed.NEXT_PUBLIC_SITE_URL).toBe("https://yourplusone.com");
  });

  it("rejects the legacy anon key", () => {
    expect(() =>
      parseClientEnv({
        ...VALID_CLIENT,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.legacy",
      }),
    ).toThrow(/sb_publishable_/);
  });

  it("names every offending key at once rather than one per boot", () => {
    let message = "";
    try {
      parseClientEnv({
        ...VALID_CLIENT,
        NEXT_PUBLIC_SITE_URL: "nope",
        NEXT_PUBLIC_APP_URL: "nope",
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/NEXT_PUBLIC_SITE_URL/);
    expect(message).toMatch(/NEXT_PUBLIC_APP_URL/);
  });
});

describe("server env", () => {
  it("accepts a well-formed environment", () => {
    expect(parseServerEnv(VALID_SERVER)).toEqual(VALID_SERVER);
  });

  it("rejects the legacy service_role key", () => {
    expect(() =>
      parseServerEnv({
        ...VALID_SERVER,
        SUPABASE_SECRET_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.legacy",
      }),
    ).toThrow(/sb_secret_/);
  });

  it("rejects a cron secret short enough to guess", () => {
    expect(() => parseServerEnv({ ...VALID_SERVER, CRON_SECRET: "short" })).toThrow(
      /Invalid server environment/,
    );
  });

  it("rejects an OTP provider outside the known adapters", () => {
    expect(() => parseServerEnv({ ...VALID_SERVER, OTP_PROVIDER: "twilio_direct" })).toThrow(
      /Invalid server environment/,
    );
  });

  it("rejects a liveness provider outside the known adapters", () => {
    expect(() => parseServerEnv({ ...VALID_SERVER, LIVENESS_PROVIDER: "onfido" })).toThrow(
      /Invalid server environment/,
    );
  });

  // `stub` is legal and is the development default — but only the stub is
  // allowed to run without credentials.
  it("lets the stub provider run without AWS credentials", () => {
    const {
      AWS_REGION: _r,
      AWS_ACCESS_KEY_ID: _k,
      AWS_SECRET_ACCESS_KEY: _s,
      ...bare
    } = VALID_SERVER;
    expect(parseServerEnv({ ...bare, LIVENESS_PROVIDER: "stub" }).LIVENESS_PROVIDER).toBe("stub");
  });

  it.each([
    ["AWS_REGION", { AWS_REGION: undefined }],
    ["AWS_ACCESS_KEY_ID", { AWS_ACCESS_KEY_ID: undefined }],
    ["AWS_SECRET_ACCESS_KEY", { AWS_SECRET_ACCESS_KEY: undefined }],
  ])("refuses aws_rekognition with %s missing", (_label, missing) => {
    // All three or none. A partial set fails on the first member to reach the
    // selfie step, which is the worst place to find out — they are mid-signup.
    expect(() =>
      parseServerEnv({ ...VALID_SERVER, ...missing, LIVENESS_PROVIDER: "aws_rekognition" }),
    ).toThrow(/AWS_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY/);
  });

  it("accepts aws_rekognition with all three", () => {
    expect(
      parseServerEnv({ ...VALID_SERVER, LIVENESS_PROVIDER: "aws_rekognition" }).LIVENESS_PROVIDER,
    ).toBe("aws_rekognition");
  });

  /**
   * Stripe Identity was a §4.2 candidate and is now unrepresentable. Its selfie
   * check carries a `document` field — it is face-matching against an uploaded
   * ID, not liveness — so choosing it would silently turn signup into government
   * ID verification.
   */
  it("no longer accepts stripe_identity", () => {
    expect(() => parseServerEnv({ ...VALID_SERVER, LIVENESS_PROVIDER: "stripe_identity" })).toThrow(
      /Invalid server environment/,
    );
  });
});
