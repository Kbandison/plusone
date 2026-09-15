import { NextResponse } from "next/server";

import { WAITLIST_REMINDER_HOUR } from "@plusone/config";

import { isAuthorisedCron } from "@/lib/cron";
import { dueForReminder, remindUnconfirmed } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

/**
 * The one confirmation reminder, sent at a sensible hour where the person is.
 *
 * ── hourly, because the hour is per ROW ────────────────────────────────────
 *
 * A metro list spanning five zones cannot be served by a schedule fixed in UTC:
 * one time is 7pm in New York and 4pm in Los Angeles. So the cron runs every
 * hour and `dueForReminder` asks, of each row, whether it is
 * WAITLIST_REMINDER_HOUR where that person said they were. Most runs send
 * nothing, which is the intended shape — the query is one indexed read against
 * a table holding tens of rows.
 *
 * Adding a metro in a sixth zone needs no change here.
 *
 * ── it sends through the same function the button does ─────────────────────
 *
 * `dueForReminder` narrows the work; it does not authorise it.
 * `remindUnconfirmed` re-checks every condition — confirmed since, already
 * reminded, inside the cooldown — and claims `reminded_at` before sending. So
 * the cron and an admin pressing the button at the same moment cannot both send
 * to one person, and neither can two runs of this route.
 *
 * ── a missed run is harmless, and a late one is not ────────────────────────
 *
 * Nothing is stamped by being SKIPPED, so a row that was due at 7pm and missed
 * is still due at 7pm tomorrow. That is the same claim-shaped recovery
 * premium-expiry uses. What it deliberately does NOT do is catch up — there is
 * no "send anything overdue" branch, because that would put the reminder at
 * whatever hour the outage ended, which is the one thing this route exists to
 * avoid.
 */
export async function POST(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const due = await dueForReminder();
  const sent = due.length > 0 ? await remindUnconfirmed(due) : 0;

  // §9.6 — counts, never who. `due` and `sent` differ when a row was claimed by
  // the button between the two calls, or when the send itself failed, and that
  // gap is the only thing worth being able to see from a log.
  return NextResponse.json({
    at: "waitlist.remind",
    hour: WAITLIST_REMINDER_HOUR,
    due: due.length,
    sent,
  });
}

/**
 * Vercel Cron invokes with GET, not POST — see premium-expiry for the full note.
 *
 * Caught here by the repo guard rather than by a job that never ran, which is
 * the failure that guard exists for: a schedule registered, monitored, and
 * answering 405 every hour looks exactly like a feature nobody uses.
 */
export const GET = POST;
