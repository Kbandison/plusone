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

  /**
   * The public half of the VAPID pair, handed to the browser when it subscribes.
   *
   * Public by design — it is an identifier, not a secret, and the browser
   * cannot subscribe without it. Optional: without it the app simply never asks
   * for permission, which is the correct behaviour in an environment that
   * cannot send.
   */
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
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
     * Phone OTP provider (§7.2). Credentials live in the Supabase dashboard, not
     * here — Supabase Auth talks to the provider on our behalf, so this only
     * records WHICH one is live. `stub` accepts a fixed code and refuses to
     * construct in production.
     *
     * BOTH real providers are legal, and switching between them is a dashboard
     * change with no deploy.
     *
     *   supabase_twilio_verify — Twilio Verify. Sends over Twilio's OWN
     *     registered infrastructure, so no A2P brand or campaign registration
     *     is needed and it works the day you configure it. $0.05 a verification,
     *     no fixed monthly cost.
     *
     *   supabase_twilio — plain Programmable Messaging over a 10DLC number we
     *     rent and register. About $0.0125 a message, but it needs an A2P brand
     *     and campaign approved by the carriers first, and carries roughly
     *     $3/month of fixed cost. Cheaper only above ~84 verifications a month.
     *
     * The app cannot tell them apart and MUST NOT try: signInWithOtp and
     * verifyOtp are the same calls either way, because Supabase owns the
     * provider seam and talks to Twilio on our behalf. This value records which
     * one is live so the stub guard can refuse when a real one is, and for no
     * other purpose — otp-provider.test.ts fails if any code starts branching
     * on which.
     *
     * One operational difference that is NOT the app's business but is worth
     * knowing: Verify owns the code's lifetime in the Verify Service, while
     * plain Twilio uses Supabase's own OTP expiry setting. The copy says ten
     * minutes; whichever is live has to agree with it.
     */
    OTP_PROVIDER: z
      .enum(["stub", "supabase_twilio", "supabase_twilio_verify"])
      /**
       * An unrecognised value must NOT take the site down, and it did.
       *
       * A strict enum here meant one wrong string in the deployment environment
       * threw out of parseServerEnv — which every server route calls — so
       * /onboarding/phone, /onboarding/liveness and all five cron jobs returned
       * 500 together. 159 errors across 155 people, from a variable that
       * controls nothing: the phone send goes straight to Supabase, and this
       * only records which provider is configured there.
       *
       * So it falls back, and the fallback is the SAFE direction. Everything
       * except "stub" closes the development sign-in — that guard tests
       * `!== "stub"` — so an unrecognised value leaves the door shut rather
       * than open. A typo now costs a log line instead of an outage, and it
       * cannot cost a way in.
       */
      .catch((ctx) => {
        console.error(
          JSON.stringify({
            at: "env.OTP_PROVIDER",
            problem: "unrecognised value, falling back to a setting that closes the dev sign-in",
            saw: String(ctx.value),
          }),
        );
        return "supabase_twilio_verify";
      }),

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

    /**
     * Web push (§8), the VAPID pair.
     *
     * VAPID is how a push service knows the sender is us rather than anyone who
     * scraped an endpoint. The public half is handed to the browser at
     * subscribe time and so is NEXT_PUBLIC_; the private half signs and must
     * never reach the bundle.
     *
     * Generate a pair with:  npx web-push generate-vapid-keys
     *
     * Both optional at the schema level and tied together by the refine below.
     * Push is the one channel that can be absent without the app being broken —
     * every screen still works, members simply are not told — so a missing pair
     * disables sending rather than failing the boot. Half a pair is a mistake
     * and is refused.
     *
     * VAPID_SUBJECT is the contact the push service is told to reach if we
     * misbehave. A mailto: or https: URL; the RFC requires one.
     */
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().optional(),

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
  )
  .refine(
    // Half a VAPID pair is a mistake, not a choice.
    //
    // Absent is legal — push is the one channel that can be missing without the
    // app being broken. But a private key with no subject signs a token no push
    // service will accept, and the failure arrives one member at a time, at
    // send time, as a 403 nobody is watching for.
    (env) => !env.VAPID_PRIVATE_KEY || Boolean(env.VAPID_SUBJECT),
    {
      path: ["VAPID_SUBJECT"],
      message:
        "VAPID_SUBJECT is required when VAPID_PRIVATE_KEY is set — a mailto: or https: URL the push service can reach",
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
