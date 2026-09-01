import type { Metadata } from "next";
import Link from "next/link";

import { DRAFT_COPY } from "@plusone/config";

import { buttonClass, Card, Wordmark } from "@/app/ui";
import { betaInviteIsOpen, storeAccountFor } from "@/lib/waitlist";
import { Install } from "./install";

const C = DRAFT_COPY.betaInvite;

export const dynamic = "force-dynamic";

/**
 * Where a beta invitation lands.
 *
 * The cookie is set in proxy.ts on this same request, not here — a Server
 * Component cannot write one. Next seals the cookie object outside the action
 * phase, so `cookies().set()` during render throws; `/i/[code]` learned this
 * the expensive way, silently attributing no referrals at all until it was
 * found. The same shape, so the same fix.
 *
 * ── it says nothing, and that is the design ─────────────────────────────────
 *
 * This link arrives by email and gets forwarded. Anyone who sees it before
 * tapping through — a preview in a group chat, a colleague looking at a
 * notification — should learn only that a private community exists. Same rule
 * as the referral landing, and the metadata matters more than the page for
 * exactly the reason written there: a preview is seen by more people than the
 * page is.
 */
export const metadata: Metadata = {
  title: C.heading,
  description: C.body,
  openGraph: { title: C.heading, description: C.body, type: "website" },
  robots: { index: false, follow: false },
};

export default async function BetaInvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const open = await betaInviteIsOpen(code);
  // Almost always known now: it is asked on the join form of anybody who ticked
  // the testing box. The Install block falls back to asking only for rows that
  // predate that, or somebody who signed up without ticking it.
  const known = open ? await storeAccountFor(code) : null;

  return (
    <main
      id="main"
      className="mx-auto flex min-h-[100dvh] max-w-[453.6px] flex-col justify-center px-6 py-24"
    >
      <Wordmark className="text-[24.3px]" />

      <Card className="mt-12">
        <h1 className="text-h2">{open ? C.heading : C.expiredHeading}</h1>
        <p className="mt-3 text-body leading-[1.7] text-ink-2">{open ? C.body : C.expiredBody}</p>

        {/* Said before the store steps, not after them. A tester who thinks
            they are blocked on an app store waits for one; the web app is the
            same app, so nobody is blocked on anything. */}
        {open ? <p className="mt-3 text-body leading-[1.7] text-ink-2">{C.worksNow}</p> : null}

        <Link
          href={open ? "/onboarding/phone" : "/waitlist"}
          className={buttonClass(open ? "primary" : "secondary", "mt-8 self-start")}
        >
          {open ? C.start : DRAFT_COPY.waitlistConfirm.rejoin}
        </Link>

        {open ? <Install code={code} known={known} /> : null}
      </Card>
    </main>
  );
}
