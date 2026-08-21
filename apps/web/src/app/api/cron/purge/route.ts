import { NextResponse } from "next/server";

import { isAuthorisedCron, serviceClient } from "@/lib/cron";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/** storage-js defaults to 100 per page; naming it makes the short-page test honest. */
const PAGE = 100;

/** 10,000 objects for one member in one bucket is not a real folder; it is a loop. */
const MAX_PAGES = 100;

/** What the cascade is about to destroy, read while it still exists. */
interface PurgeTarget {
  readonly user_id: string;
  readonly stripe_customer_id: string | null;
  readonly stripe_sub_id: string | null;
  readonly voice_note_paths: string[] | null;
  /**
   * Keyed on the room, not the member, so an anonymous post cannot be traced to
   * its author — which also means there is no user-id folder to list. The row
   * holding the path is the only index, and the cascade removes it.
   */
  readonly room_image_paths: string[] | null;
  /**
   * The same shape again, keyed on the CHAT: chat-images/<chat_id>/<message_id>,
   * because who may see one is decided by chat participation. No user-id folder
   * to list, and the messages row holding the path is what the cascade removes.
   */
  readonly chat_image_paths: string[] | null;
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
 *     recording of the voice of somebody who asked to be forgotten. Chat
 *     images are keyed the same way and go the same way.
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

  // Stripe FIRST, then the rows.
  //
  // Cancelling after the delete meant the webhook Stripe fires in response —
  // customer.subscription.deleted, carrying metadata.user_id — arrived to find
  // no profiles row, so the upsert failed a foreign key, the handler now throws
  // on a failed write, and Stripe retried it for days. purge_targets has already
  // read the ids, so nothing is lost by doing this while the rows still exist:
  // a crash between the two leaves a cancelled subscription and a live account,
  // which is recoverable, where the other order leaves a charged card and no
  // record of who to refund.
  const billingFailures: string[] = [];
  for (const target of targets) {
    if (target.stripe_sub_id) {
      try {
        await stripe().subscriptions.cancel(target.stripe_sub_id);
      } catch {
        // Already cancelled is the common case. A real failure must not be
        // silent — the member is still being billed.
        billingFailures.push(`sub:${target.stripe_sub_id}`);
      }
    }
    if (target.stripe_customer_id) {
      try {
        await stripe().customers.del(target.stripe_customer_id);
      } catch {
        billingFailures.push(`customer:${target.stripe_customer_id}`);
      }
    }
  }

  const { data, error } = await supabase.rpc("purge_due_deletions");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const purged = ((data ?? []) as { purged_user_id: string }[]).map((r) => r.purged_user_id);
  const orphaned: string[] = [];

  for (const userId of purged) {
    for (const bucket of ["photos", "verification-selfies"]) {
      // Paginated. list() defaults to { limit: 100, offset: 0 } in storage-js,
      // so this saw at most the first hundred objects in a folder and removed
      // only those — while remove() succeeded on the hundred it was given, so
      // nothing was reported and the response said the member was purged.
      // Bounded. Each pass removes a full page, so the folder shrinks and the
      // offset deliberately stays at zero — but a remove() that reports success
      // without removing anything would spin forever, and a cron job that never
      // returns is worse than one that gives up loudly.
      let offset = 0;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const { data: files, error: listError } = await supabase.storage
          .from(bucket)
          .list(userId, { limit: PAGE, offset });
        if (listError) {
          orphaned.push(`${bucket}/${userId}`);
          break;
        }
        if (!files?.length) break;

        const { error: removeError } = await supabase.storage
          .from(bucket)
          .remove(files.map((f) => `${userId}/${f.name}`));
        if (removeError) {
          orphaned.push(`${bucket}/${userId}`);
          break;
        }

        // A short page is the last one. Removal shrinks the folder, so the
        // offset deliberately does not advance.
        if (files.length < PAGE) break;
      }
    }

    const target = byUser.get(userId);

    // By exact key, because there is no prefix to list under.
    const voiceNotes = target?.voice_note_paths ?? [];
    if (voiceNotes.length > 0) {
      const { error: voiceError } = await supabase.storage.from("voice-notes").remove(voiceNotes);
      if (voiceError) orphaned.push(`voice-notes/${userId}`);
    }

    const roomImages = target?.room_image_paths ?? [];
    if (roomImages.length > 0) {
      const { error: imageError } = await supabase.storage.from("room-images").remove(roomImages);
      if (imageError) orphaned.push(`room-images/${userId}`);
    }

    const chatImages = target?.chat_image_paths ?? [];
    if (chatImages.length > 0) {
      const { error: chatImageError } = await supabase.storage
        .from("chat-images")
        .remove(chatImages);
      if (chatImageError) orphaned.push(`chat-images/${userId}`);
    }
  }

  // Blocked threads past retention, in the same nightly pass.
  //
  // Separate from the hard delete above and deliberately after it: this one
  // removes messages from accounts that still exist, so a failure here must not
  // be able to abandon a member's deletion request half-done.
  //
  // The same storage rule applies. A voice note lives at
  // voice-notes/<chat_id>/<message_id> and the row holding that path is exactly
  // what the delete removes, so the function hands the paths back rather than
  // leaving an unreferenced recording of somebody's voice in the bucket.
  const { data: blockedRows, error: blockedError } = await supabase.rpc(
    "sweep_purge_blocked_threads",
  );
  if (blockedError) orphaned.push(`blocked-threads:${blockedError.message}`);

  const blockedThreads = (blockedRows ?? []) as {
    chat_id: string;
    voice_note_paths: string[] | null;
    image_paths: string[] | null;
  }[];

  for (const thread of blockedThreads) {
    const voice = thread.voice_note_paths ?? [];
    if (voice.length > 0) {
      const { error: voiceError } = await supabase.storage.from("voice-notes").remove(voice);
      if (voiceError) orphaned.push(`voice-notes/${thread.chat_id}`);
    }

    // A photograph somebody sent into a thread they were then blocked out of
    // has exactly the same reason to go as the voice note beside it.
    const images = thread.image_paths ?? [];
    if (images.length > 0) {
      const { error: imageError } = await supabase.storage.from("chat-images").remove(images);
      if (imageError) orphaned.push(`chat-images/${thread.chat_id}`);
    }
  }

  // Reported rather than swallowed: an orphaned object is a file that should
  // not exist, and a billing failure is a card still being charged. Nobody
  // finds out unless the job says so.
  return NextResponse.json({
    purged: purged.length,
    blockedThreadsPurged: blockedThreads.length,
    orphaned,
    billingFailures,
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
