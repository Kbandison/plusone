import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Where a signed-out member lands (§7.2 is unchanged — this is not an
 * onboarding step, and the ten steps still start at the phone).
 *
 * Deliberately outside `/onboarding`: someone arriving here already has an
 * account, and sending them to step one of signing up both reads wrong and,
 * before this existed, cost them a text they did not need to spend.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ link?: string }>;
}) {
  const { link } = await searchParams;
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  // `/onboarding` resolves to whichever step they belong on, or to /app.
  if (data.user) redirect("/onboarding");

  return (
    <main id="main" className="mx-auto w-full max-w-[640px] px-6 py-16 sm:py-24">
      <h1 className="text-h2">{DRAFT_COPY.signIn.heading}</h1>
      <p className="mt-4 text-[16px] leading-[1.7] text-ink-2">{DRAFT_COPY.signIn.intro}</p>

      {/* /auth/callback sends people here when a link is expired or reused.
          Without this they land on a plain sign-in screen with no idea why the
          link they just clicked did nothing. */}
      {link === "expired" ? (
        <p role="status" className="mt-6 text-[15px] leading-[1.65] text-ink-2">
          {DRAFT_COPY.signIn.linkExpired}
        </p>
      ) : null}

      <SignInForm />
    </main>
  );
}
