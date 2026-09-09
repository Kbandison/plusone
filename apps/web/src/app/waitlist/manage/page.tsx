import type { Metadata } from "next";
import Link from "next/link";

import { DRAFT_COPY } from "@plusone/config";

import { buttonClass, Card, PublicShell } from "@/app/ui";
import { waitlistPreferences } from "@/lib/waitlist";
import { ManageForm } from "./manage-form";

/**
 * Deferred, not resolved.
 *
 * `instant = false` marks this segment as ALLOWED TO BLOCK while Cache
 * Components is adopted one route at a time — the incremental flow the
 * migration guide describes. It does not force the route to be dynamic, so a
 * genuinely prerenderable one still ships a static shell.
 *
 * Removing this line is the unit of work: the route then has to resolve its own
 * validation, by caching data with `use cache` or wrapping the runtime parts in
 * <Suspense>.
 */
export const instant = false;

const C = DRAFT_COPY.waitlistManage;

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
    <PublicShell variant="act">
      {prefs ? (
        <ManageForm
          token={token}
          metro={prefs.metro}
          wantsBeta={prefs.wantsBeta}
          invited={prefs.invited}
          storePlatform={prefs.storePlatform}
          storeEmail={prefs.storeEmail}
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
    </PublicShell>
  );
}
