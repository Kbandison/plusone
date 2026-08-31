import type { Metadata } from "next";
import Link from "next/link";

import { DRAFT_COPY } from "@plusone/config";

import { buttonClass, Card, Wordmark } from "@/app/ui";
import { confirmWaitlist } from "@/lib/waitlist";

const C = DRAFT_COPY.waitlistConfirm;

export const dynamic = "force-dynamic";

/**
 * The other end of the confirmation email.
 *
 * ── why confirming on GET, when leaving does not ────────────────────────────
 *
 * Mail clients and corporate scanners prefetch links, so a GET that CHANGES
 * something is a real hazard — and /waitlist/leave takes a POST for exactly
 * that reason, because a prefetched unsubscribe removes somebody who never
 * clicked and they never find out.
 *
 * Confirming is the case where the trade goes the other way. The worst a
 * prefetch does here is confirm an address that the person holding the mailbox
 * was sent the link for anyway, and the cost of a second click is a share of
 * people who never complete and are then stuck — the address is taken, the
 * token is only in a mail they have stopped looking at, and the resend cap is
 * an hour. So this one is a GET, on purpose, and it is written down because it
 * looks like an oversight beside its neighbour.
 *
 * `robots: noindex` because the URL contains a token.
 */
export const metadata: Metadata = {
  title: C.heading,
  robots: { index: false, follow: false },
};

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const ok = await confirmWaitlist(t ?? "");

  return (
    <main
      id="main"
      className="mx-auto flex min-h-[100dvh] max-w-[453.6px] flex-col justify-center px-6 py-24"
    >
      <Wordmark className="text-[24.3px]" />

      <Card className="mt-12">
        <h1 className="text-h2">{ok ? C.heading : C.invalidHeading}</h1>
        <p className="mt-3 text-body leading-[1.7] text-ink-2">{ok ? C.body : C.invalidBody}</p>

        {ok ? null : (
          <Link href="/waitlist" className={buttonClass("secondary", "mt-8 self-start")}>
            {C.rejoin}
          </Link>
        )}
      </Card>
    </main>
  );
}
