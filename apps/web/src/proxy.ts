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

  // The referral cookie is set HERE, not on the landing page.
  //
  // /i/[code] is a Server Component and was calling cookies().set() during
  // render. Next seals the cookie object outside the action phase — the seal
  // proxy replaces set/delete/clear with a thrower — so every real invite link
  // raised "Cookies can only be modified in a Server Action or Route Handler"
  // and no referral was ever attributed. The proxy runs on the same request and
  // owns the outgoing response, which is where this belongs.
  //
  // Read after getUser() deliberately: setAll may have rebuilt `response`, and
  // writing before that would drop the cookie on the floor.
  const invite = /^\/i\/([a-z0-9]{6,12})$/.exec(request.nextUrl.pathname);
  if (invite?.[1]) {
    response.cookies.set("plusone_ref", invite[1], {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  // The beta invitation, carried the same way and for the same reason.
  //
  // A SEPARATE cookie and a separate path from the referral above, deliberately.
  // A referral says "an existing member invited a friend" and is minted by
  // my_referral_code() for anybody who asks; a beta invitation says "the
  // operator admitted this person" and is the only thing that permits an
  // account to exist right now. Sharing one namespace would mean any member
  // could mint themselves a way through the beta gate.
  //
  // Sixteen hex characters, matching mintInviteCode() in lib/waitlist.ts. The
  // pattern is narrow on purpose: this cookie is read by the one action that
  // decides whether an account may be created.
  //
  // Still not a decision — this only carries the value. Whether it is valid,
  // unexpired and unspent is asked in the onboarding action, against the
  // database, on every send. A cookie is a claim, not a credential.
  const beta = /^\/beta\/([0-9a-f]{16})$/.exec(request.nextUrl.pathname);
  if (beta?.[1]) {
    response.cookies.set("plusone_beta", beta[1], {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      // Matches WAITLIST_INVITE_TTL_DAYS. The database is what actually
      // expires it; this only stops a stale cookie outliving the invitation it
      // names by months.
      maxAge: 60 * 60 * 24 * 14,
    });
  }

  return response;
}

export const config = {
  // Everything except static assets. Without a matcher this runs on fonts and
  // images too, which is a database round trip per icon.
  //
  // `.well-known` is excluded for the same reason and one more: the files there
  // are fetched by verifiers rather than by members — Chrome checking
  // assetlinks.json before it will drop a TWA's address bar — so there is no
  // session to refresh, and touching Supabase on their behalf is a round trip
  // spent on a request that has no cookies at all.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
