import { NextResponse } from "next/server";

import { NEARBY_JOIN_MIN_COUNT, NOTIFY_TIMING } from "@plusone/config";

import { isAuthorisedCron, serviceClient } from "@/lib/cron";
import { notify } from "@/lib/notify";
import { notifier } from "@/lib/notifier";

export const dynamic = "force-dynamic";

/**
 * "People are active near you" (§8, server 18c) — the premium saved alert.
 *
 * Hourly rather than daily, and that is the whole point of it: the free stat on
 * Browse is a fact about the area, and this is a fact about right now. What
 * stops hourly becoming a nag is not the schedule but the claim —
 * claim_activity_alerts enforces a per-member cooldown and stamps as it
 * selects, so a member can be told at most once a day however often this runs.
 *
 * It also refuses to fire outside 09:00–21:00 in the member's OWN timezone,
 * which is why this cannot simply be a daily job at a fixed UTC hour.
 *
 * The floor is NEARBY_JOIN_MIN_COUNT, shared with nearby-joins deliberately
 * rather than copied: it is §8's "count granularity < 5" and there should be
 * one of it. The count comes back and is used only to decide whether to send.
 * It never reaches the payload — see the template in notifications.ts.
 */
export async function POST(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  // Built FIRST, before anything is claimed — the fuse warning's lesson, and it
  // applies here for the same reason: the claim is self-consuming. If notifier()
  // throws after the stamp has committed, a whole day's alert is spent on
  // nobody, and the member simply never hears anything.
  try {
    notifier();
  } catch (error) {
    return NextResponse.json({ error: String(error), told: 0 }, { status: 500 });
  }

  const { data, error } = await serviceClient().rpc("claim_activity_alerts", {
    p_window_hours: NOTIFY_TIMING.activityAlertWindowHours,
    p_min: NEARBY_JOIN_MIN_COUNT,
    p_cooldown_hours: NOTIFY_TIMING.activityAlertCooldownHours,
    p_from_hour: NOTIFY_TIMING.activityAlertFromHourLocal,
    p_to_hour: NOTIFY_TIMING.activityAlertToHourLocal,
  });
  /**
   * 42883 is `undefined_function`, and here it means one specific thing:
   * 20260829001000 has not been applied yet.
   *
   * Migrations in this repo are applied BY HAND and are Kevin's call, so code
   * reaching production before its schema is the normal order rather than an
   * edge case — WSL put a live break on the profile page this way an hour
   * before this was written. Nothing in the build can see the gap: check:sql
   * validates the migration and typecheck validates the TypeScript, and the
   * space between them is only visible in production.
   *
   * So this is separated from a real failure rather than folded into one 500.
   * A generic error every hour is something people learn to scroll past; a
   * line naming the migration is something somebody can act on. It needs no
   * second deploy either — the hour after the function exists, this route
   * starts working on its own.
   */
  if (error) {
    const pending = error.code === "42883";
    return NextResponse.json(
      {
        error: pending
          ? "20260829001000 is not applied — claim_activity_alerts does not exist"
          : error.message,
        pending_migration: pending,
        told: 0,
      },
      { status: pending ? 503 : 500 },
    );
  }

  const recipients = ((data ?? []) as { user_id: string }[]).map((row) => row.user_id);
  await notify("activity_nearby", recipients);

  // How many were told, and nothing else. §9.6 keeps this to counts, and the
  // per-member counts are the one number here that could locate somebody.
  return NextResponse.json({ told: recipients.length });
}

/**
 * Vercel Cron invokes with GET. A schedule in vercel.json against a POST-only
 * route is a job that is registered, monitored, and has never once run.
 */
export const GET = POST;
