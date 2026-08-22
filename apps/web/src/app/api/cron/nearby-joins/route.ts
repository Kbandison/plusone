import { NextResponse } from "next/server";

import { NEARBY_JOIN_MIN_COUNT, NOTIFY_TIMING } from "@plusone/config";

import { isAuthorisedCron, serviceClient } from "@/lib/cron";
import { notify } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * "New members joined near you" (§8).
 *
 * The only event in the matrix that is not about something that happened TO
 * the member — which is exactly why it is weekly, and why its default channel
 * is in-app alone. A push saying "come back, there are new people" is the
 * engagement loop §3.3 bans; a line in a list the member opens on their own
 * terms is not, and they can turn even that off.
 *
 * The count never reaches the payload. NEARBY_JOIN_MIN_COUNT is a floor for
 * whether to say anything at all — below five, in a thin local pool, "1 new
 * member joined near you" plus a browse screen is a name. Above it the message
 * is still the same content-blind sentence for everybody, because a NUMBER on
 * a lock screen is the granularity §8 spends a whole rule refusing.
 *
 * claim_nearby_joins counts only people the member could actually see: same
 * community or both opted in, dating mode, not blocked, verified. A count that
 * included the invisible would be a lie, and a lie that leaks.
 */
export async function POST(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const { data, error } = await serviceClient().rpc("claim_nearby_joins", {
    p_days: NOTIFY_TIMING.nearbyJoinWindowDays,
    p_min: NEARBY_JOIN_MIN_COUNT,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const recipients = ((data ?? []) as { user_id: string }[]).map((row) => row.user_id);
  await notify("nearby_joins", recipients);

  // How many people were told. Deliberately not how many joined, or where:
  // §9.6 keeps this to counts, and the per-member counts are the one number
  // here that could locate somebody.
  return NextResponse.json({ told: recipients.length });
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
