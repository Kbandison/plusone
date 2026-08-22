import { NextResponse } from "next/server";

import { NOTIFY_TIMING } from "@plusone/config";

import { isAuthorisedCron, serviceClient } from "@/lib/cron";
import { notify } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * Warn, then sweep (§6.3).
 *
 * The sweep has always been here. The warning has not, and its absence made
 * the seven-day expiry read as a deletion rather than a deadline: the member
 * who was asked opened the inbox one day and the row was simply gone, with no
 * moment at which anything said "this is about to go".
 *
 * Both in one job because they are two ends of the same clock, and because the
 * order matters — warning after sweeping would warn about connects that no
 * longer exist. The hourly cadence is fine for a 24-hour notice.
 *
 * The warning goes to the person who was ASKED, and only to them. See
 * claim_connect_expiry_warnings: telling the sender their connect is about to
 * lapse is telling them the other person has not answered, which is
 * information about somebody else's behaviour that they can do nothing with.
 */
export async function POST(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const supabase = serviceClient();

  const { data: due, error: warnError } = await supabase.rpc("claim_connect_expiry_warnings", {
    p_hours: NOTIFY_TIMING.connectExpiryWarningHours,
  });
  if (warnError) return NextResponse.json({ error: warnError.message }, { status: 500 });

  const warned = (due ?? []) as { connect_id: string; target_id: string }[];
  // One at a time rather than one call for the group, because the subject is
  // per row: the in-app copy links to the connect it is about, and a member
  // with two expiring gets two lines pointing at two different threads.
  await Promise.all(
    warned.map((row) => notify("connect_expiring", [row.target_id], { subjectId: row.connect_id })),
  );

  const { data, error } = await supabase.rpc("sweep_expired_connects");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ warned: warned.length, swept: data ?? 0 });
}

/**
 * Vercel Cron invokes with GET, not POST.
 *
 * Registering a schedule in vercel.json and exporting only POST produces a 405
 * on every fire — a job that is scheduled, monitored, and has never once run.
 * For the purge that means deletion requests recorded and never executed, which
 * is the §9.3 promise failing silently in the direction that keeps data.
 *
 * The Bearer check in isAuthorisedCron is what actually guards this, and it is
 * the same on both verbs, so exporting GET costs nothing.
 */
export const GET = POST;
