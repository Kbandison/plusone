import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { getServerSupabase } from "@/lib/supabase";

/**
 * Where an emailed link lands.
 *
 * Members click the link. They do it even when the same email also carries a
 * six-digit code, and without somewhere for the click to go it fails quietly:
 * `@supabase/ssr` uses PKCE, so Supabase sends them back here with a `?code=`
 * that has to be exchanged for a session. Nothing exchanged it, so the click
 * dropped them on a page still signed out with no explanation.
 *
 * Handles both shapes an emailed link can arrive as:
 *   - `?code=`                  — PKCE, from a magic link or an OTP email
 *   - `?token_hash=&type=`      — the template style, including the
 *                                 `email_change` confirmation that Settings
 *                                 sends when a member adds an address
 *
 * Route Handlers are uncached by default, which is what this needs — a cached
 * auth exchange would hand one member's session to the next caller.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const supabase = await getServerSupabase();
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  let failed = true;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      // Supabase's own union; the template decides which of them arrives.
      type: type as EmailOtpType,
    });
    failed = Boolean(error);
  }

  if (failed) {
    // An expired or reused link is the common case, not an outage. /sign-in can
    // send a fresh code, which is the only useful thing to do about it.
    return NextResponse.redirect(new URL("/sign-in?link=expired", origin));
  }

  // `next` lets Settings send the member back where they were. Only ever a path
  // on this origin: an absolute URL here would be an open redirect, and one on
  // a sign-in callback is a credential-phishing hop.
  const next = searchParams.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/onboarding";

  return NextResponse.redirect(new URL(safeNext, origin));
}
