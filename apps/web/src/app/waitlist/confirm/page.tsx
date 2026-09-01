import type { Metadata } from "next";
import Link from "next/link";

import { DRAFT_COPY } from "@plusone/config";

import { buttonClass, Card, PublicShell } from "@/app/ui";
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
  const token = t ?? "";
  const { ok, wantsBeta } = await confirmWaitlist(token);

  return (
    <PublicShell>
      <Card className="mt-12">
        {/* Two different people, told two different things. Somebody who ticked
            the testing box has done an extra step and is in a different queue;
            showing them the plain waitlist sentence is how they conclude the
            tick did not register. */}
        <h1 className="text-h2">
          {!ok ? C.invalidHeading : wantsBeta ? C.betaHeading : C.heading}
        </h1>
        <p className="mt-3 text-body leading-[1.7] text-ink-2">
          {!ok ? C.invalidBody : wantsBeta ? C.betaBody : C.body}
        </p>

        {ok && wantsBeta ? (
          <p className="mt-4 text-[11.7px] leading-[1.6] text-ink-3">{C.betaNote}</p>
        ) : null}

        {ok ? (
          <Link
            href={`/waitlist/manage?t=${encodeURIComponent(token)}`}
            className={buttonClass("secondary", "mt-8 self-start")}
          >
            {C.manage}
          </Link>
        ) : (
          <Link href="/waitlist" className={buttonClass("secondary", "mt-8 self-start")}>
            {C.rejoin}
          </Link>
        )}
      </Card>
    </PublicShell>
  );
}
