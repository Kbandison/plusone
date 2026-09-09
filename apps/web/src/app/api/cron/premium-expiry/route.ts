import { NextResponse } from "next/server";

import { NOTIFY_TIMING } from "@plusone/config";

import { isAuthorisedCron, serviceClient } from "@/lib/cron";
import { notify } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * "Your premium is ending soon" (§8).
 *
 * The only event in the matrix that costs the member money to ignore, and the
 * only one whose default channel is email rather than push. A lapse is a thing
 * to deal with, not a moment to look at — and §8 gives every transactional
 * email one subject with the content behind the login, so it adds a line in an
 * inbox and nothing else.
 *
 * Daily, because the window is three days wide and an hourly sweep of the same
 * three days would be twenty-four queries for the same handful of rows. The
 * claim makes a missed day harmless: whoever was due yesterday is still due
 * today, because nothing stamped them.
 *
 * The stamp is the PERIOD, not the time. A renewal moves current_period_end
 * forward and the comparison notices; a plain "already warned" flag would have
 * warned each member once, in their first year, and never again.
 */
export async function POST(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const { data, error } = await serviceClient().rpc("claim_premium_expiry_warnings", {
    p_days: NOTIFY_TIMING.premiumExpiryWarningDays,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const recipients = ((data ?? []) as { user_id: string }[]).map((row) => row.user_id);
  await notify("premium_expiring", recipients);

  // §9.6 — a count, never who.
  return NextResponse.json({ warned: recipients.length });
}

/**
 * Vercel Cron invokes with GET, not POST.
 *
 * Registering a schedule in vercel.json and exporting only POST produces a 405
 * on every fire — a job that is scheduled, monitored, and has never once run.
 *
 * The Bearer check in isAuthorisedCron is what actually guards this, and it is
 * the same on both verbs, so exporting GET costs nothing.
 */
export const GET = POST;
