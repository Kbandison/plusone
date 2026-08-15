import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";

import { COPY } from "@plusone/config";

export const dynamic = "force-dynamic";

/**
 * The invite landing (§3.4, Decision #25).
 *
 * Deliberately says nothing. This link gets posted in closed groups and
 * forwarded between people, and anyone who sees it before tapping through
 * learns only that a private community exists. The copy is verbatim §3.4 for
 * exactly that reason — every word here was chosen to out nobody.
 *
 * The metadata matters as much as the page: a link preview is seen by more
 * people than the page is.
 */
export const metadata: Metadata = {
  title: COPY.referral.landingHeadline,
  description: COPY.referral.landingSub,
  openGraph: {
    title: COPY.referral.landingHeadline,
    description: COPY.referral.landingSub,
    type: "website",
  },
  robots: { index: false, follow: false },
};

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  // Code goes to a cookie, not the URL of the next page. It survives the whole
  // of onboarding and is attributed once the invitee has an account — the point
  // at which there is anyone to attribute it to.
  if (/^[a-z0-9]{6,12}$/.test(code)) {
    const store = await cookies();
    store.set("plusone_ref", code, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return (
    <main
      id="main"
      className="mx-auto flex min-h-[100dvh] max-w-[560px] flex-col justify-center px-6 py-24"
    >
      <p className="font-display text-[30px] leading-none tracking-[-0.02em]">
        <span className="align-super text-[0.42em] text-accent">+</span>One
      </p>

      <h1 className="mt-12 text-[clamp(2rem,7vw,2.9rem)] text-balance">
        {COPY.referral.landingHeadline}
      </h1>

      <p className="mt-6 text-[17px] leading-[1.7] text-ink-2">{COPY.referral.landingSub}</p>

      <Link
        href="/onboarding/phone"
        className="ease-brand mt-10 self-start rounded-lg bg-accent px-6 py-3.5 text-[16px] text-accent-ink transition-[opacity,transform] duration-200 hover:opacity-90 active:scale-[0.995]"
      >
        {COPY.referral.landingButton}
      </Link>
    </main>
  );
}
