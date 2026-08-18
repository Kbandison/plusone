"use server";

import { revalidatePath } from "next/cache";

import {
  DRAFT_COPY,
  REPORT_DETAIL_MAX_CHARS,
  REPORT_REASONS,
  type ReportReason,
} from "@plusone/config";

import { getServerSupabase } from "./supabase";
import type { SafetyState } from "./safety-state";
import { redirect } from "next/navigation";

/**
 * Blocking (§5.3).
 *
 * Immediate and mutual: `is_blocked_either_way` is in the visibility walls, so
 * the moment this row exists neither member appears to the other in the drop,
 * in browse, or in rooms.
 *
 * An existing chat is handled differently, and this comment used to claim
 * otherwise. The chat policies test only membership and whether the chat is
 * open — no block term — so blocking from inside a chat did nothing to it, and
 * the other member could keep sending. A trigger now CLOSES any open chat
 * between the two (20260817000500), which the insert policy already refuses to
 * write to. Messages already sent stay readable to both: hiding them
 * retroactively is a product decision nobody has made, and it would destroy
 * what a member might want to attach to a report.
 *
 * It asks nothing and explains nothing. A member blocking someone is often
 * having the worst moment this product will give them, and a confirmation
 * dialogue asking them to justify it is the wrong thing to put in the way. It
 * is reversible from Settings, which is where the explaining belongs.
 */
export async function blockMember(_prev: SafetyState, formData: FormData): Promise<SafetyState> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  // A room post can be blocked by message id instead of author id.
  //
  // Room posts render with no author, so a member writing in "Newly diagnosed"
  // reasonably reads the room as unattributed — and it shipped the author's
  // uuid to the client anyway, where any reader could lift it out of the page
  // payload and open /app/connect/<uuid> to get a name, a photo and prompts.
  // A personal diagnosis story became a name and a face.
  //
  // Resolving it here means the id never leaves the server.
  const roomMessageId = String(formData.get("room_message_id") ?? "");
  let blockedId = String(formData.get("blocked_id") ?? "");
  if (!blockedId && roomMessageId) {
    const { data: message } = await supabase
      .from("room_messages")
      .select("user_id")
      .eq("id", roomMessageId)
      .maybeSingle();
    blockedId = (message?.user_id as string | undefined) ?? "";
  }
  if (!blockedId) return { error: "That didn't work.", message: null };
  const { error } = await supabase
    .from("blocks")
    .insert({ blocker_id: auth.user.id, blocked_id: blockedId });

  // Already blocked is not a failure.
  if (error && error.code !== "23505") return { error: "That didn't work.", message: null };

  for (const path of ["/app", "/app/browse", "/app/chats", "/app/settings"]) revalidatePath(path);
  return { error: null, message: "Blocked." };
}

export async function unblockMember(_prev: SafetyState, formData: FormData): Promise<SafetyState> {
  const blockedId = String(formData.get("blocked_id") ?? "");

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");
  const { error } = await supabase
    .from("blocks")
    .delete()
    .eq("blocker_id", auth.user.id)
    .eq("blocked_id", blockedId);

  if (error) return { error: "That didn't work.", message: null };

  revalidatePath("/app/settings");
  return { error: null, message: null };
}

/**
 * Reporting (§7.3).
 *
 * A report is a row plus a moderation_queue entry, written together — a report
 * nobody is queued to read is a complaint, not a report.
 *
 * Blocking is offered alongside but kept separate. They are different asks: one
 * is "I never want to see this person", the other is "someone should look at
 * this". Conflating them means a member who wants a moderator to act has to
 * also lose their own view of the evidence.
 */
export async function reportMember(_prev: SafetyState, formData: FormData): Promise<SafetyState> {
  const reason = String(formData.get("reason") ?? "") as ReportReason;
  if (!(reason in REPORT_REASONS)) return { error: "Choose what happened.", message: null };

  const reportedUserId = String(formData.get("reported_user_id") ?? "") || null;
  const reportedMessageId = String(formData.get("reported_message_id") ?? "") || null;
  const reportedRoomMessageId = String(formData.get("reported_room_message_id") ?? "") || null;
  const detail =
    String(formData.get("detail") ?? "")
      .trim()
      .slice(0, REPORT_DETAIL_MAX_CHARS) || null;

  if (!reportedUserId && !reportedMessageId && !reportedRoomMessageId) {
    return { error: "That didn't work.", message: null };
  }

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  // Deliberately NOT tone-checked. A report describes something that happened,
  // and the words for it are often the words that were used. Refusing a report
  // for its language would silence the person it is meant to protect.
  const { error } = await supabase.from("reports").insert({
    reporter_id: auth.user.id,
    reported_user_id: reportedUserId,
    reported_message_id: reportedMessageId,
    reported_room_message_id: reportedRoomMessageId,
    reason,
    detail,
  });

  if (error) return { error: "That didn't send. Try again.", message: null };

  if (formData.get("also_block") === "on" && reportedUserId) {
    await supabase.from("blocks").insert({ blocker_id: auth.user.id, blocked_id: reportedUserId });
    for (const path of ["/app", "/app/browse", "/app/chats"]) revalidatePath(path);
  }

  return { error: null, message: DRAFT_COPY.app.reportSent };
}
