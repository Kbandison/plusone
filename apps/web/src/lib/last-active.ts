import "server-only";

import { lastActiveStamp } from "@plusone/config";

import { serviceClient } from "./cron";

/**
 * Record that this member was in the app today. At most one effective write a
 * day.
 *
 * The DAY, never the moment — lastActiveStamp has the argument: the column is
 * readable by any member who can see the profile, and a precise "last seen" is
 * the wrong thing to hand them on this app.
 *
 * `.lt("last_active_at", day)` is the throttle. Every full page load asks, and
 * the update matches a row only the first time each day; the rest are an
 * indexed lookup that changes nothing. It also never moves the value BACKWARDS,
 * so a signup timestamp from this afternoon is left alone until tomorrow.
 *
 * The service client, because `authenticated` holds no update grant on this
 * column — and must not: a member who could set their own last-active could
 * keep themselves at the top of Browse and inside everybody's Drop for ever.
 * The id comes from the verified session in the caller, never from input.
 *
 * Never throws, and logs the error CODE only (§9.6): this runs after the
 * response, and a failed bookkeeping write must not surface anywhere.
 */
export async function recordActivity(userId: string, at: Date = new Date()): Promise<void> {
  const day = lastActiveStamp(at);
  try {
    const { error } = await serviceClient()
      .from("profiles")
      .update({ last_active_at: day })
      .eq("id", userId)
      .lt("last_active_at", day);
    if (error)
      console.error(JSON.stringify({ at: "activity.record", problem: error.code ?? "unknown" }));
  } catch (cause) {
    console.error(
      JSON.stringify({
        at: "activity.record",
        problem: cause instanceof Error ? cause.message : "unknown",
      }),
    );
  }
}
