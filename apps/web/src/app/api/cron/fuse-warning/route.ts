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

  const supabase = serviceClient();
  const { data, error } = await supabase.rpc("fuses_expiring_within", {
    p_hours: FUSE.warningHoursBeforeExpiry,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const recipients = [...new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id))];
  if (recipients.length === 0) return NextResponse.json({ notified: 0 });

  const deliveries = notify.planDeliveries("fuse_warning", recipients);
  const result = await notifier().send(deliveries);

  return NextResponse.json({ notified: result.sent, failed: result.failed });
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
