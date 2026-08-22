import { NextResponse } from "next/server";

import { DROP } from "@plusone/config";
import { notify } from "@plusone/logic";

import { isAuthorisedCron, serviceClient } from "@/lib/cron";
import { notifier } from "@/lib/notifier";
import { notify as notifyMember } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * "Tonight's Drop is ready" (§8).
 *
 * The drop lands at DROP.hourLocal — 20:00 in each member's own timezone — and
 * until this route existed nothing said so. Whoever happened to open the app in
 * the evening got it; everybody else found three cards from four nights ago.
 * The rhythm is the product, and a nightly moment nobody is told about is not
 * one.
 *
 * Runs every fifteen minutes rather than hourly, because timezones are not all
 * whole hours: India is +5:30, Nepal +5:45, the Chatham Islands +12:45. An
 * hourly sweep would reach those members up to forty-five minutes late. This is
 * cheap to run precisely because the claim is self-consuming — a sweep with
 * nobody due does one query and returns.
 *
 * Every member is claimed at most once per night by construction. See
 * claim_drop_notifications: it selects and stamps in one statement, so a second
 * run inside the same night finds nothing.
 */
export async function POST(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  // Built FIRST, before anything is claimed.
  //
  // The fuse warning learned this one expensively: createStubNotifier throws
  // synchronously at construction when NODE_ENV is 'production', and it was
  // built after the claim had already stamped and committed. Each run consumed
  // a whole window of warnings and then threw, so nobody was ever warned. A
  // refusal up here costs nothing — the rows stay unclaimed for a run that can
  // actually deliver.
  //
  // Still a pre-flight even though notify() builds its own, and MORE necessary
  // now: notify() swallows its failures on purpose, because a notification is a
  // courtesy attached to something that already succeeded. That is right at a
  // call site and wrong here, where the claim is consumed whether or not
  // anything was delivered. So the construction is tested before the claim, and
  // the result is thrown away.
  try {
    notifier();
  } catch (error) {
    return NextResponse.json({ error: String(error), claimed: 0 }, { status: 500 });
  }

  const supabase = serviceClient();

  const { data, error } = await supabase.rpc("claim_drop_notifications", {
    p_hour: DROP.hourLocal,
  });

  if (error) {
    return NextResponse.json({ error: error.message, claimed: 0 }, { status: 500 });
  }

  const recipients = ((data ?? []) as { user_id: string }[]).map((row) => row.user_id);
  if (recipients.length === 0) {
    return NextResponse.json({ claimed: 0, sent: 0, failed: 0 });
  }

  // Push only. There is no email here on purpose: "your Drop is ready" is a
  // nudge, and a nudge that arrives in somebody's inbox — where a subject line
  // sits in a list beside work mail, on a screen anyone can glance at — is a
  // different and worse thing than a line on a lock screen the member asked
  // for. §8's channel matrix is what planDeliveries takes; this passes the one
  // channel that suits the event.
  /**
   * Through the shared dispatcher, so the in-app copy is written and the
   * member's own switches are honoured.
   *
   * This route built its own deliveries and sent them directly, which was right
   * when push was the only channel there was. It is not any more: a member who
   * has turned the drop's push off would still have been buzzed, and one who
   * missed the buzz would have had nothing to come back to.
   */
  await notifyMember("drop_ready", recipients);
  const result = { sent: recipients.length, failed: 0 };

  // Counts only. §9.6 — no ids, no endpoints, nothing that identifies who was
  // told what.
  return NextResponse.json({ claimed: recipients.length, ...result });
}

/**
 * Vercel Cron sends GET, and a route exporting only POST answers 405.
 *
 * Silently: the job appears in the dashboard, is scheduled, is monitored, and
 * has never once run. The other five routes here learned that already, and this
 * one was written with POST alone until cron-routes.test.ts refused it.
 *
 * The Bearer check in isAuthorisedCron is what actually guards this and it is
 * the same on both verbs, so exporting GET costs nothing.
 */
export const GET = POST;
