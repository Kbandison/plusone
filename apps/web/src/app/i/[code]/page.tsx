import type { Metadata } from "next";
import Link from "next/link";

import { COPY } from "@plusone/config";
import { buttonClass, PublicShell } from "@/app/ui";

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

export default async function InvitePage() {
  // The cookie is set in proxy.ts, on the same request.
  //
  // It was set here, and a Server Component cannot: Next seals the cookie
  // object outside the action phase, so `store.set` threw on every real invite
  // link and no referral was ever attributed. The code still survives the whole
  // of onboarding and is attributed once the invitee has an account — the point
  // at which there is anyone to attribute it to.

  return (
    <PublicShell>
      <h1 className="mt-12 text-h1 text-balance">{COPY.referral.landingHeadline}</h1>

      <p className="mt-6 text-[13.8px] leading-[1.7] text-ink-2">{COPY.referral.landingSub}</p>

      {/* /waitlist during the closed beta, and the referral survives it.
       *
       * A referral is a MEMBER inviting a friend; a beta invitation is the
       * operator admitting somebody. Letting the first stand in for the second
       * would mean any member could mint a way through the gate, at which point
       * the beta is not closed. So the friend joins the list like anybody else.
       *
       * Nothing is lost by the detour: `plusone_ref` was set by proxy.ts on
       * this request and lives thirty days, and attribution happens once the
       * invitee has an account — which is the point at which there is anyone to
       * attribute it to, whenever that turns out to be. */}
      <Link href="/waitlist" className={buttonClass("primary", "mt-10 self-start")}>
        {COPY.referral.landingButton}
      </Link>
    </PublicShell>
  );
}
