import { NextResponse } from "next/server";

import { FUSE } from "@plusone/config";
import { notify } from "@plusone/logic";

import { isAuthorisedCron, serviceClient } from "@/lib/cron";
import { notifier } from "@/lib/notifier";

export const dynamic = "force-dynamic";

/**
 * The 24-hour fuse warning (§8, §6.2).
 *
 * `fuses_expiring_within` returns chat ids, member ids and expiry times, and
 * deliberately nothing about what the chat contains — so there is nothing here
 * that could end up in a payload even by accident. The body is
 * "One of your chats closes tomorrow", which does not say which one.
 *
 * Recipients are de-duplicated: someone with three chats closing tomorrow gets
 * one notification, not three. Three identical vague pushes are worse than one,
 * because the count is itself information the member did not ask to broadcast
 * to their lock screen.
 */
export async function POST(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  // The notifier is built FIRST, before anything is claimed.
  //
  // createStubNotifier throws SYNCHRONOUSLY at construction when NODE_ENV is
  // 'production' — which it is on every Vercel deployment — and that happened
  // after claim_fuse_warnings had already stamped and committed. So each hourly
  // fire consumed a whole window of warnings and then threw, and nobody would
  // ever have been warned about a closing chat. Constructing it up here means a
  // refusal costs nothing: the rows stay unclaimed for a run that can deliver.
  let send: notify.Notifier;
  try {
    send = notifier();
  } catch (error) {
    return NextResponse.json({ error: String(error), claimed: 0 }, { status: 500 });
  }

  const supabase = serviceClient();

  // CLAIM, not query.
  //
  // This asked fuses_expiring_within for every chat closing inside 24 hours and
  // wrote nothing back — and the job runs hourly. So a member whose chat closed
  // tomorrow got the same warning twenty-four times. §8's whole posture is that
  // a notification here is a rare, careful thing, and the count on a lock screen
  // is itself information nobody asked to broadcast.
  //
  // claim_fuse_warnings selects and stamps fuse_warned_at in one statement, so
  // the query is self-consuming: a second run finds nothing. A narrower time
  // window would not have done it — a job that missed one tick would then skip
  // the warning altogether.
  const { data, error } = await supabase.rpc("claim_fuse_warnings", {
    p_hours: FUSE.warningHoursBeforeExpiry,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const recipients = [
    ...new Set(((data ?? []) as { member_id: string }[]).map((r) => r.member_id)),
  ];
  if (recipients.length === 0) return NextResponse.json({ notified: 0 });

  const deliveries = notify.planDeliveries("fuse_warning", recipients);
  const result = await send.send(deliveries);

  // A TRADE-OFF, stated rather than assumed.
  //
  // The stamp happens when the rows are claimed, before the send. So a delivery
  // that fails loses that member's warning entirely — the chat is marked warned
  // and the next run skips it. The alternative is to stamp afterwards, which
  // double-sends whenever the job crashes between the two, and §8's posture is
  // that a duplicate push about a closing chat is worse than a missed one: the
  // count on a lock screen is itself information nobody asked to broadcast.
  //
  // The notifier reports only totals, not which delivery failed, so there is
  // nothing finer to un-stamp. The claimed count is returned so a run that sent
  // fewer than it claimed is visible rather than silent.
  return NextResponse.json({
    claimed: recipients.length,
    notified: result.sent,
    failed: result.failed,
  });
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
