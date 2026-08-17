import { z } from "zod";

/**
 * Environment schema. Parsed once at boot so a missing key fails the deploy
 * rather than surfacing as a null at 2am.
 *
 * Split into client/server on purpose: anything without NEXT_PUBLIC_ must never
 * reach the browser bundle (BACKEND.md anti-pattern #1).
 */

/** Supabase's new key style. Legacy anon/service_role keys are banned in new code. */
const publishableKey = z
  .string()
  .startsWith("sb_publishable_", "Use the new sb_publishable_ key, not the legacy anon key");

const secretKey = z
  .string()
  .startsWith("sb_secret_", "Use the new sb_secret_ key, not the legacy service_role key");

/**
 * An origin — scheme + host + optional port, nothing after it.
 *
 * Supabase's dashboard shows two similar-looking values on the same screen: the
 * Project URL (`https://<ref>.supabase.co`) and the RESTful endpoint
 * (`https://<ref>.supabase.co/rest/v1`). The client wants the first and pastes
 * of the second are easy to make and slow to diagnose — every request 404s with
 * "Invalid path specified in request URL" long after the paste. Catch it here.
 *
 * A lone trailing slash is a normal artefact of copying from a browser bar, so
 * it is normalised away rather than rejected; anything more is a real mistake.
 */
const origin = z
  .url()
  .refine(
    (value) => {
      // Refinements still run when the base check has already failed, so this
      // has to survive a value that is not a URL at all — an escaping TypeError
      // would replace the whole formatted issue list with a bare "Invalid URL"
      // and lose the name of the key that caused it.
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        return false;
      }
      return url.pathname === "/" && url.search === "" && url.hash === "";
    },
    {
      message:
        "must be an origin with no path — use the Project URL (https://<ref>.supabase.co), not the RESTful endpoint",
    },
  )
  .transform((value) => new URL(value).origin);

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: origin,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  NEXT_PUBLIC_SITE_URL: origin,
  NEXT_PUBLIC_APP_URL: origin,
});

export const serverEnvSchema = z
  .object({
    /** Server-only Supabase key. Bypasses RLS — used solely by cron and admin paths. */
    SUPABASE_SECRET_KEY: secretKey,

    STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
    STRIPE_PRICE_PREMIUM_1MO: z.string().startsWith("price_"),
    STRIPE_PRICE_PREMIUM_3MO: z.string().startsWith("price_"),
    STRIPE_PRICE_PREMIUM_6MO: z.string().startsWith("price_"),

    RESEND_API_KEY: z.string().startsWith("re_"),

    /**
     * Phone OTP provider (§7.2). Twilio credentials live in the Supabase
     * dashboard, not here — Supabase Auth talks to Twilio on our behalf, so this
     * only records WHICH provider is live. `stub` accepts a fixed code and
     * refuses to construct in production.
     */
    OTP_PROVIDER: z.enum(["stub", "supabase_twilio"]),

    /**
     * Swappable liveness adapter (§4.2). `stub` is legal here and is the default
     * for development; the stub itself refuses to construct in production, so a
     * forgotten `stub` fails loudly at boot rather than verifying everyone.
     *
     * §4.2 listed three candidates. `stripe_identity` is GONE, and it is worth
     * writing down why so nobody re-proposes it: Stripe Identity has no
     * selfie-only mode. Its `Selfie` report carries a `document` field — "the
     * File holding the image of the identity document used in this check" —
     * because the check is face-MATCHING against an ID, not liveness. Using it
     * would mean every member hands a government ID to a third party to join a
     * dating app for people with HSV or HIV, which is a different product.
     *
     * `facetec` stays: same category as AWS, not evaluated, still open.
     *
     * The old single-opaque-key shape is gone too. It was always a placeholder —
     * AWS needs a region and a key pair, not one string.
     */
    LIVENESS_PROVIDER: z.enum(["stub", "facetec", "aws_rekognition"]),

    /**
     * AWS, for Face Liveness. Optional at the schema level and required by the
     * refine below, so the message names the provider that needs them rather
     * than reading as "always required".
     *
     * Face Liveness is not in every region. Pinning it here rather than letting
     * the SDK read AWS_DEFAULT_REGION means an unsupported region fails on our
     * terms, at boot.
     */
    AWS_REGION: z.string().optional(),
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),

    /** Shared secret so only Vercel Cron can invoke /api/cron/*. */
    CRON_SECRET: z.string().min(32),

    /**
     * Bare host of a local dev tunnel, e.g. `abc-123.trycloudflare.com`.
     *
     * Read by next.config.ts at BUILD time, not by the app — it names the
     * tunnel in `serverActions.allowedOrigins` so Next's Origin/host CSRF check
     * does not reject actions arriving through it. Listed here because this
     * schema is what .env.example is checked against, and a variable nobody
     * declares is a variable nobody can find.
     *
     * Optional, and ignored entirely when NODE_ENV=production.
     */
    DEV_TUNNEL_HOST: z.string().optional(),
  })
  .refine(
    // Only the stub runs without credentials. A real provider missing them would
    // otherwise fail on the first member to reach the selfie step — which is the
    // worst place to discover it, because that member is already mid-signup.
    (env) =>
      env.LIVENESS_PROVIDER !== "aws_rekognition" ||
      Boolean(env.AWS_REGION && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY),
    {
      path: ["AWS_REGION"],
      message:
        "AWS_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are all required when LIVENESS_PROVIDER=aws_rekognition",
    },
  );

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
}

export function parseClientEnv(source: Record<string, string | undefined>): ClientEnv {
  const result = clientEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid client environment:\n${formatIssues(result.error)}`);
  }
  return result.data;
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid server environment:\n${formatIssues(result.error)}`);
  }
  return result.data;
}
