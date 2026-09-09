import { NextResponse } from "next/server";

import { isAuthorisedCron, serviceClient } from "@/lib/cron";
import { notify } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * Closes what the fuse ran out on, and says so (§6.2, §3.5).
 *
 * The closing note is the point of §3.5 — a chat here never just stops, it
 * ends with something written — and nobody was ever told it had ended. The
 * note sat in a thread the member had no reason to open again, which is the
 * one piece of the closure ritual that only works if somebody reads it.
 *
 * The notice is claimed separately from the sweep rather than derived from it,
 * because a chat also closes when a PERSON closes it, at any hour, and that is
 * the case where a note is most likely to be waiting. claim_chat_closed_notices
 * covers both and excludes the person who did the closing.
 */
export async function POST(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const supabase = serviceClient();

  const { data, error } = await supabase.rpc("sweep_expired_fuses");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // After the sweep, so the chats it just closed are announced on this run
  // rather than fifteen minutes later.
  const { data: notices, error: noticeError } = await supabase.rpc("claim_chat_closed_notices");
  if (noticeError) {
    // Reported, not thrown. The sweep already committed and the stamp on those
    // chats has not moved, so the next run announces them.
    return NextResponse.json({ swept: data ?? 0, announced: 0, error: noticeError.message });
  }

  const rows = (notices ?? []) as { chat_id: string; member_id: string }[];
  await Promise.all(
    rows.map((row) => notify("chat_closed", [row.member_id], { subjectId: row.chat_id })),
  );

  return NextResponse.json({ swept: data ?? 0, announced: rows.length });
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
