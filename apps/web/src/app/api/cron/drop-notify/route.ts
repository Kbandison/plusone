import { NextResponse } from "next/server";

import { DROP } from "@plusone/config";

import { isAuthorisedCron, serviceClient } from "@/lib/cron";
import { DROP_REACH_MI, wouldHaveDrop, type CandidateRow } from "@/lib/drop-candidates";
import { notifier } from "@/lib/notifier";
import { notify as notifyMember } from "@/lib/notify";
import { dropConfig } from "@/lib/tunables";

export const dynamic = "force-dynamic";

/** Members asked about per `drop_candidates_for` call. */
const CANDIDATE_BATCH = 25;

interface DueRow {
  user_id: string;
  search_radius_mi: number | null;
  intention: string | null;
}

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
 * Three steps, and the order is the design (20261006000100):
 *
 *   1. who is due        — past the hour, not yet told tonight. Stamps nothing.
 *   2. who has a Drop    — selectDrop over their candidates, here in TypeScript,
 *                          because it is the function that builds the Drop.
 *   3. stamp and send    — only those, and only if still due.
 *
 * Step 2 used to be a SQL check of whether drop_candidates returned any row.
 * drop_candidates applies the walls and RETURNS already-connected, last-active
 * and last-served for isEligible to filter, so a member who had met or been
 * shown everyone in reach was told their Drop had landed onto an empty screen.
 *
 * Nobody is stamped before step 2 decides. A member stamped and then skipped
 * would be unnotified for the rest of the night even if the pool filled at
 * nine; one with an empty Drop stays due and is asked again next run.
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

  const due = await supabase.rpc("drop_notification_due", { p_hour: DROP.hourLocal });

  // 20261006000100 not applied yet. Migrations here are applied by hand, so
  // this code reaches production first as a matter of course — and the nightly
  // push must keep running on the old claim until it is. Narrow on purpose:
  // PGRST202 is PostgREST's "no such function", 42883 is Postgres's. Anything
  // else is a real failure and must not quietly route around the new rule.
  if (due.error?.code === "PGRST202" || due.error?.code === "42883") {
    return legacyClaim(supabase);
  }
  if (due.error) {
    return NextResponse.json({ error: due.error.message, claimed: 0 }, { status: 500 });
  }

  const dueRows = (due.data ?? []) as DueRow[];
  if (dueRows.length === 0) {
    return NextResponse.json({ due: 0, empty: 0, claimed: 0, sent: 0, failed: 0 });
  }

  // Through the SERVICE client: tunable_config is not granted to anon, and a
  // decision made on compiled defaults could disagree with the tuned Drop.
  const config = await dropConfig(supabase);
  const now = Date.now();

  const rowsByViewer = new Map<string, CandidateRow[]>();
  for (let start = 0; start < dueRows.length; start += CANDIDATE_BATCH) {
    const { data, error } = await supabase.rpc("drop_candidates_for", {
      p_user_ids: dueRows.slice(start, start + CANDIDATE_BATCH).map((row) => row.user_id),
      // The same reach the Drop fetches with, or the two answer different
      // questions about the same evening.
      p_radius_mi: DROP_REACH_MI,
    });
    // Nothing is stamped yet, so failing here loses nobody — the next run
    // asks again.
    if (error) {
      return NextResponse.json({ error: error.message, claimed: 0 }, { status: 500 });
    }
    for (const row of (data ?? []) as (CandidateRow & { viewer_id: string })[]) {
      const list = rowsByViewer.get(row.viewer_id) ?? [];
      list.push(row);
      rowsByViewer.set(row.viewer_id, list);
    }
  }

  const withDrop = dueRows
    .filter((member) =>
      wouldHaveDrop(
        { intention: member.intention, radiusMi: member.search_radius_mi },
        rowsByViewer.get(member.user_id) ?? [],
        now,
        config,
      ),
    )
    .map((member) => member.user_id);

  const empty = dueRows.length - withDrop.length;
  if (withDrop.length === 0) {
    return NextResponse.json({ due: dueRows.length, empty, claimed: 0, sent: 0, failed: 0 });
  }

  const stamped = await supabase.rpc("stamp_drop_notifications", {
    p_hour: DROP.hourLocal,
    p_user_ids: withDrop,
  });
  if (stamped.error) {
    return NextResponse.json({ error: stamped.error.message, claimed: 0 }, { status: 500 });
  }

  // Who was STAMPED, not who was decided. An overlapping run that got there
  // first has already told them, and the stamp returns nobody for those.
  const recipients = ((stamped.data ?? []) as { user_id: string }[]).map((row) => row.user_id);
  if (recipients.length > 0) {
    await sendDropReady(recipients);
  }

  // Counts only. §9.6 — no ids, no endpoints, nothing that identifies who was
  // told what.
  return NextResponse.json({
    due: dueRows.length,
    empty,
    claimed: recipients.length,
    sent: recipients.length,
    failed: 0,
  });
}

/**
 * Push only. There is no email here on purpose: "your Drop is ready" is a
 * nudge, and a nudge that arrives in somebody's inbox — where a subject line
 * sits in a list beside work mail, on a screen anyone can glance at — is a
 * different and worse thing than a line on a lock screen the member asked for.
 *
 * Through the shared dispatcher, so the in-app copy is written and the member's
 * own switches are honoured. This route once built its own deliveries and sent
 * them directly; a member who had turned the drop's push off would still have
 * been buzzed, and one who missed the buzz would have had nothing to come back
 * to.
 */
async function sendDropReady(recipients: string[]) {
  await notifyMember("drop_ready", recipients);
}

/**
 * The claim as it was before 20261006000100, kept for exactly as long as that
 * migration is unapplied.
 *
 * It asks drop_has_candidates, which is the looser question — it counts people
 * the Drop then hides — so an empty Drop can still be announced on this path.
 * Delete this, and the two functions it calls, once the migration is live.
 */
async function legacyClaim(supabase: ReturnType<typeof serviceClient>) {
  const { data, error } = await supabase.rpc("claim_drop_notifications", {
    p_hour: DROP.hourLocal,
    p_radius_mi: DROP_REACH_MI,
  });

  if (error) {
    return NextResponse.json({ error: error.message, claimed: 0 }, { status: 500 });
  }

  const recipients = ((data ?? []) as { user_id: string }[]).map((row) => row.user_id);
  if (recipients.length > 0) {
    await sendDropReady(recipients);
  }
  return NextResponse.json({
    legacy: true,
    claimed: recipients.length,
    sent: recipients.length,
    failed: 0,
  });
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
