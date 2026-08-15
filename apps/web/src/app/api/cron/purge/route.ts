import { NextResponse } from "next/server";

import { isAuthorisedCron, serviceClient } from "@/lib/cron";

export const dynamic = "force-dynamic";

/**
 * Hard delete (§9.3), on the never-cut list.
 *
 * The database removes the auth user and everything cascades from it. Storage
 * objects cannot cascade, so they are removed here — and deliberately AFTER the
 * rows are gone: a crash between the two leaves orphaned files, which is
 * recoverable, where the other order leaves a deleted member's photos with a
 * live profile pointing at them.
 */
export async function POST(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const supabase = serviceClient();
  const { data, error } = await supabase.rpc("purge_due_deletions");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const purged = ((data ?? []) as { purged_user_id: string }[]).map((r) => r.purged_user_id);
  const orphaned: string[] = [];

  for (const userId of purged) {
    for (const bucket of ["photos", "verification-selfies"]) {
      const { data: files } = await supabase.storage.from(bucket).list(userId);
      if (!files?.length) continue;
      const { error: removeError } = await supabase.storage
        .from(bucket)
        .remove(files.map((f) => `${userId}/${f.name}`));
      if (removeError) orphaned.push(`${bucket}/${userId}`);
    }
  }

  // Reported rather than swallowed: an orphaned object is a file that should
  // not exist, and nobody finds out unless the job says so.
  return NextResponse.json({ purged: purged.length, orphaned });
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
