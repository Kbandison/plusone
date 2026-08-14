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

export const serverEnvSchema = z.object({
  /** Server-only Supabase key. Bypasses RLS — used solely by cron and admin paths. */
  SUPABASE_SECRET_KEY: secretKey,

  STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  STRIPE_PRICE_PREMIUM_1MO: z.string().startsWith("price_"),
  STRIPE_PRICE_PREMIUM_3MO: z.string().startsWith("price_"),
  STRIPE_PRICE_PREMIUM_6MO: z.string().startsWith("price_"),

  RESEND_API_KEY: z.string().startsWith("re_"),

  /**
   * Swappable liveness adapter (§4.2). The provider choice is still open — see
   * PROJECT_UPDATES.md — so `stub` is a legal value here and is the default for
   * development. The stub itself refuses to construct in production, so a
   * forgotten `stub` fails loudly at boot rather than verifying everyone.
   *
   * The single-opaque-key shape below will not survive the real choice: AWS
   * needs an access key id, a secret and a region, and Stripe Identity has no
   * key of its own (it reuses STRIPE_SECRET_KEY). Widen this when we pick,
   * rather than guessing a shape now.
   */
  LIVENESS_PROVIDER: z.enum(["stub", "stripe_identity", "facetec", "aws_rekognition"]),
  LIVENESS_API_KEY: z.string().optional(),

  /** Shared secret so only Vercel Cron can invoke /api/cron/*. */
  CRON_SECRET: z.string().min(32),
}).refine(
  // Only the stub runs without a credential. Any real provider missing its key
  // would otherwise fail on the first member to reach the selfie step.
  (env) => env.LIVENESS_PROVIDER === "stub" || (env.LIVENESS_API_KEY ?? "").length > 0,
  {
    path: ["LIVENESS_API_KEY"],
    message: "required for every provider except stub",
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
