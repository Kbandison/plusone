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
  LIVENESS_API_KEY: "abc123",
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
      parseClientEnv({ ...VALID_CLIENT, NEXT_PUBLIC_SITE_URL: "nope", NEXT_PUBLIC_APP_URL: "nope" });
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

  // The provider choice is still open (§4.2 defers it), so `stub` is legal —
  // but only the stub is allowed to run without a credential.
  it("lets the stub provider run without a key", () => {
    const { LIVENESS_API_KEY: _omitted, ...withoutKey } = VALID_SERVER;
    expect(parseServerEnv({ ...withoutKey, LIVENESS_PROVIDER: "stub" }).LIVENESS_PROVIDER).toBe(
      "stub",
    );
  });

  it.each(["aws_rekognition", "stripe_identity", "facetec"])(
    "requires a key for %s",
    (provider) => {
      const { LIVENESS_API_KEY: _omitted, ...withoutKey } = VALID_SERVER;
      expect(() => parseServerEnv({ ...withoutKey, LIVENESS_PROVIDER: provider })).toThrow(
        /LIVENESS_API_KEY/,
      );
    },
  );
});
