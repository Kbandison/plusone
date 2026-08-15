import "server-only";

import { createServiceSupabase } from "@plusone/db";
import { parseClientEnv, parseServerEnv } from "@plusone/config";

/**
 * Cron plumbing.
 *
 * These are the only legitimate callers of the service client (§5.3): they act
 * across every member's rows, so there is no version of "as the caller" that
 * makes sense for them.
 *
 * Authorisation is a shared secret compared in constant time. A timing-variable
 * comparison on a bearer token is a slow leak of the token itself, and this
 * endpoint deletes accounts.
 */

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isAuthorisedCron(request: Request): boolean {
  const { CRON_SECRET } = parseServerEnv(process.env);
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  return presented.length > 0 && constantTimeEquals(presented, CRON_SECRET);
}

/**
 * The service client. BYPASSES RLS.
 *
 * Legitimate callers are the cron jobs and the Stripe webhook — paths that act
 * across every member and have no member behind them. Anything in a request
 * path should use the server client so the member's own walls apply.
 *
 * The one deliberate exception is the liveness verdict. It is written in a
 * request path, but the value is the provider's rather than the member's, and
 * the member must not be able to write down their own verification result —
 * see onboarding/liveness/actions.ts.
 */
export function serviceClient() {
  const { NEXT_PUBLIC_SUPABASE_URL } = parseClientEnv(process.env);
  const { SUPABASE_SECRET_KEY } = parseServerEnv(process.env);
  return createServiceSupabase(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY);
}
