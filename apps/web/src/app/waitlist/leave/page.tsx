import type { Metadata } from "next";

import { DRAFT_COPY } from "@plusone/config";

import { Wordmark } from "@/app/ui";
import { LeaveForm } from "./leave-form";

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
    <main
      id="main"
      className="mx-auto flex min-h-[100dvh] max-w-[453.6px] flex-col justify-center px-6 py-24"
    >
      <Wordmark className="text-[24.3px]" />
      <LeaveForm token={t ?? ""} />
    </main>
  );
}
