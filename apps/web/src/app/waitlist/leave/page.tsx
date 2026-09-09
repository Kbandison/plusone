import type { Metadata } from "next";

import { DRAFT_COPY } from "@plusone/config";

import { LeaveForm } from "./leave-form";
import { PublicShell } from "@/app/ui";

export const dynamic = "force-dynamic";

/**
 * Leaving, without an account and without signing in.
 *
 * This is also what Play's data-safety form means by a deletion route that
 * works without the app installed — for somebody on the waitlist there is
 * nothing to install and no account to delete from, and this URL is in the
 * footer of every email we send them.
 *
 * The GET only renders. The delete is a POST — see the action.
 */
export const metadata: Metadata = {
  title: DRAFT_COPY.waitlist.leaveLink,
  robots: { index: false, follow: false },
};

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;

  return (
    <PublicShell>
      <LeaveForm token={t ?? ""} />
    </PublicShell>
  );
}
