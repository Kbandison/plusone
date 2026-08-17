import { NextResponse } from "next/server";

import { isAuthorisedCron, serviceClient } from "@/lib/cron";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/** What the cascade is about to destroy, read while it still exists. */
interface PurgeTarget {
  readonly user_id: string;
  readonly stripe_customer_id: string | null;
  readonly stripe_sub_id: string | null;
  readonly voice_note_paths: string[] | null;
}

/**
 * Hard delete (§9.3), on the never-cut list.
 *
 * The database removes the auth user and everything cascades from it. Storage
 * objects cannot cascade, so they are removed here — and deliberately AFTER the
 * rows are gone: a crash between the two leaves orphaned files, which is
 * recoverable, where the other order leaves a deleted member's photos with a
 * live profile pointing at them.
 *
 * But two things the cascade destroys are the only handles on what has to be
 * cleaned up outside the database, so they are read FIRST:
 *
 *   - Voice notes live at voice-notes/<chat_id>/<message_id>, keyed on the chat
 *     rather than the member, so there is no user-id prefix to list. The
 *     messages rows holding those paths are exactly what the cascade removes.
 *     Sweeping two buckets and not this one left an unreferenced, undiscoverable
 *     recording of the voice of somebody who asked to be forgotten.
 *
 *   - The Stripe customer and subscription ids live only on the subscriptions
 *     row, which cascades from profiles. §9.3 asks for a customer detach and
 *     nothing here called Stripe at all, so a deleted member's card kept being
 *     charged every month with no record left to reconcile against.
 */
export async function POST(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const supabase = serviceClient();

  // Read-only, and the same due set purge_due_deletions will take. Safe to run
  // twice; a crash between this and the delete loses nothing.
  const { data: targetRows, error: targetError } = await supabase.rpc("purge_targets");
  if (targetError) {
    return NextResponse.json({ error: targetError.message }, { status: 500 });
  }
  const targets = (targetRows ?? []) as PurgeTarget[];
  const byUser = new Map(targets.map((t) => [t.user_id, t]));

  const { data, error } = await supabase.rpc("purge_due_deletions");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const purged = ((data ?? []) as { purged_user_id: string }[]).map((r) => r.purged_user_id);
  const orphaned: string[] = [];
  const billingFailures: string[] = [];

  for (const userId of purged) {
    for (const bucket of ["photos", "verification-selfies"]) {
      const { data: files } = await supabase.storage.from(bucket).list(userId);
      if (!files?.length) continue;
      const { error: removeError } = await supabase.storage
        .from(bucket)
        .remove(files.map((f) => `${userId}/${f.name}`));
      if (removeError) orphaned.push(`${bucket}/${userId}`);
    }

    const target = byUser.get(userId);

    // By exact key, because there is no prefix to list under.
    const voiceNotes = target?.voice_note_paths ?? [];
    if (voiceNotes.length > 0) {
      const { error: voiceError } = await supabase.storage.from("voice-notes").remove(voiceNotes);
      if (voiceError) orphaned.push(`voice-notes/${userId}`);
    }

    // Cancel before detaching: deleting a customer with a live subscription is
    // an invoice nobody will ever see.
    if (target?.stripe_sub_id) {
      try {
        await stripe().subscriptions.cancel(target.stripe_sub_id);
      } catch {
        // Already cancelled is the common case and is not a failure worth
        // shouting about — but a real one must not be silent, because the
        // member is still being billed and the mapping is now gone.
        billingFailures.push(`sub:${target.stripe_sub_id}`);
      }
    }
    if (target?.stripe_customer_id) {
      try {
        await stripe().customers.del(target.stripe_customer_id);
      } catch {
        billingFailures.push(`customer:${target.stripe_customer_id}`);
      }
    }
  }

  // Reported rather than swallowed: an orphaned object is a file that should
  // not exist, and a billing failure is a card still being charged. Nobody
  // finds out unless the job says so.
  return NextResponse.json({ purged: purged.length, orphaned, billingFailures });
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
