import { NextResponse, type NextRequest } from "next/server";

import { parseClientEnv } from "@plusone/config";
import { createServerSupabase } from "@plusone/db";

/**
 * Keeps the session alive.
 *
 * lib/supabase.ts swallows cookie writes with the note "refresh happens in
 * middleware", and there was no middleware. Server Components cannot set
 * cookies, so a refreshed access token had nowhere to go: once the token
 * expired, a member reading pages was signed out and had to verify by SMS
 * again. On a phone-only auth model that is not just a bad session — it is a
 * Twilio bill that tracks hours of use instead of signups.
 *
 * In Next 16 this file is `proxy.ts`, not `middleware.ts`. The convention was
 * renamed; the behaviour is the same.
 *
 * Nothing here decides anything. It touches the user so supabase-ssr can
 * rotate the token, and hands the cookies back. Every wall is still RLS's job,
 * and every redirect is still the layout's — a proxy that starts making
 * authorisation decisions is a second place for them to be wrong.
 */
export async function proxy(request: NextRequest) {
  const env = parseClientEnv(process.env);
  let response = NextResponse.next({ request });

  const supabase = createServerSupabase(
    {
      url: env.NEXT_PUBLIC_SUPABASE_URL,
      publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    },
    {
      getAll: () => request.cookies.getAll().map(({ name, value }) => ({ name, value })),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        // Rebuilt so the rotated cookies are on the outgoing response too —
        // setting them only on the request would refresh the token and then
        // throw it away, which is the bug this file exists to fix.
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, options as Record<string, unknown>);
        }
      },
    },
  );

  // The call is the point: supabase-ssr rotates an expiring token here, and
  // setAll above is what persists it.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Everything except static assets. Without a matcher this runs on fonts and
  // images too, which is a database round trip per icon.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
