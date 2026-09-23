import { NextResponse } from "next/server";

import { WAITLIST_REMINDER_HOUR } from "@plusone/config";

import { isAuthorisedCron } from "@/lib/cron";
import { dueForReminder, remindUnconfirmed, sendDueInviteNudges } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

/**
 * Two jobs on one schedule, both at WAITLIST_REMINDER_HOUR where the person is:
 * the one confirmation reminder, and the three invitation nudges (2026-09-23).
 * They share this route because they share everything that makes it hard — the
 * per-row hour, the claim, the refusal to catch up — and a second hourly cron
 * would be a second copy of all three.
 *
 * ── the nudges have no button ─────────────────────────────────────────────
 *
 * The confirmation reminder can also be sent from /admin/waitlist; the nudges
 * cannot, by Kevin's call. So for them this route is the only sender, and
 * `sendDueInviteNudges` claims each one before sending exactly as the reminder
 * does, which is what keeps two overlapping runs from sending one twice.
 *
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

  // ONE instant for the whole run. Every row's hour, every nudge's stage and
  // every nudge's stamp are decided against it, so a run that takes a few
  // seconds cannot decide a stage on one side of a boundary and stamp it on
  // the other.
  const at = new Date();

  const due = await dueForReminder(at);
  const sent = due.length > 0 ? await remindUnconfirmed(due) : 0;
  const nudges = await sendDueInviteNudges(at);

  // §9.6 — counts, never who. `due` and `sent` differ when a row was claimed by
  // the button between the two calls, or when the send itself failed, and that
  // gap is the only thing worth being able to see from a log. Same for the
  // nudges, where the only other claimant is an overlapping run.
  return NextResponse.json({
    at: "waitlist.remind",
    hour: WAITLIST_REMINDER_HOUR,
    due: due.length,
    sent,
    nudgesDue: nudges.due,
    nudgesSent: nudges.sent,
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
