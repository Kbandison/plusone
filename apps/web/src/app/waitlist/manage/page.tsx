import type { Metadata } from "next";
import Link from "next/link";

import { DRAFT_COPY } from "@plusone/config";

import { buttonClass, Card, Wordmark } from "@/app/ui";
import { waitlistPreferences } from "@/lib/waitlist";
import { ManageForm } from "./manage-form";

const C = DRAFT_COPY.waitlistManage;

export const dynamic = "force-dynamic";

/**
 * Everything a person on the list can do without an account.
 *
 * This replaces a page that could only unsubscribe, and the footer of every
 * email now names it as "change your area, opt in or out of testing, or leave"
 * rather than "leave the list". That wording is the point: `joinWaitlist`
 * refuses to act on a confirmed address, so before this page the ONLY door
 * anybody had was the exit — somebody who wanted to move city or start testing
 * could do neither, and the one control on offer deleted them.
 *
 * `/waitlist/leave` still exists and still works. Links in already-sent emails
 * point at it.
 */
export const metadata: Metadata = {
  title: C.heading,
  robots: { index: false, follow: false },
};

export default async function ManagePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const token = t ?? "";
  const prefs = await waitlistPreferences(token);

  return (
    <main
      id="main"
      className="mx-auto flex min-h-[100dvh] max-w-[453.6px] flex-col justify-center px-6 py-24"
    >
      <Wordmark className="text-[24.3px]" />

      {prefs ? (
        <ManageForm
          token={token}
          metro={prefs.metro}
          wantsBeta={prefs.wantsBeta}
          invited={prefs.invited}
        />
      ) : (
        <Card className="mt-12">
          <h1 className="text-h2">{C.invalidHeading}</h1>
          <p className="mt-3 text-body leading-[1.7] text-ink-2">{C.invalidBody}</p>
          <Link href="/waitlist" className={buttonClass("secondary", "mt-8 self-start")}>
            {DRAFT_COPY.waitlistConfirm.rejoin}
          </Link>
        </Card>
      )}
    </main>
  );
}
