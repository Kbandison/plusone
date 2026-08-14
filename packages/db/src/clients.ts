import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase clients.
 *
 * This package stays platform-agnostic on purpose — web, mobile and admin all
 * consume it, so nothing here may import `next/headers`. The server factory takes
 * a cookie adapter and the calling app supplies its own.
 *
 * Three clients, three trust levels:
 *   browser  — publishable key, RLS applies, safe in the bundle
 *   server   — publishable key + the user's session, RLS applies as that user
 *   service  — secret key, BYPASSES RLS, server-only, never in a request path
 */

export interface SupabaseCredentials {
  url: string;
  publishableKey: string;
}

export interface CookieAdapter {
  getAll: () => { name: string; value: string }[];
  setAll: (cookies: { name: string; value: string; options?: unknown }[]) => void;
}

/** Browser client. RLS is the only thing protecting this data — see §5.3. */
export function createBrowserSupabase({ url, publishableKey }: SupabaseCredentials) {
  return createBrowserClient(url, publishableKey);
}

/**
 * Server client bound to the caller's session. Every query runs as that member,
 * so the walls in `visible_profiles` and the RLS policies still apply.
 */
export function createServerSupabase(
  { url, publishableKey }: SupabaseCredentials,
  cookies: CookieAdapter,
) {
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (cookiesToSet) => cookies.setAll(cookiesToSet),
    },
  });
}

/**
 * Service client. BYPASSES RLS ENTIRELY.
 *
 * Legitimate callers are exactly: the Drop cron, the fuse sweep, the connect
 * expiry sweep, the hard-delete purge job, the Stripe webhook, and the admin app
 * behind its own role check. Anything else reaching for this is a bug — use the
 * server client so the member's own walls apply.
 */
export function createServiceSupabase(url: string, secretKey: string): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("createServiceSupabase was called in a browser context");
  }
  if (!secretKey.startsWith("sb_secret_")) {
    throw new Error("createServiceSupabase requires an sb_secret_ key");
  }
  return createSupabaseClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
