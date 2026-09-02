"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";

export interface UnsendState {
  error: string | null;
}

/**
 * Taking a message back.
 *
 * Not the gate, like every other action in this folder. `unsend_message()` is
 * SECURITY DEFINER and checks the sender itself, because it writes
 * `message_redactions` — a table granted to no role at all. Nothing here decides
 * who may unsend; deleting the whole file would change only the error copy.
 *
 * ── it is a redaction, and the copy must not claim otherwise ────────────────
 *
 * The content moves to `message_redactions` and stays there for moderation,
 * because `reports.reported_message_id` is `on delete set null` — a real delete
 * leaves a moderator holding an accusation with nothing attached, and "send it,
 * get reported, delete it" must not be a way out.
 *
 * So this is honestly "removed from the conversation" and never "deleted". The
 * account-deletion copy in this product says "This cannot be undone — and we
 * mean actually deleted", which is the standard the wording here has to meet:
 * if a claim of deletion is made anywhere, it has to be true.
 */
export async function unsendMessage(
  _previous: UnsendState,
  formData: FormData,
): Promise<UnsendState> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const messageId = formData.get("messageId");
  const chatId = formData.get("chatId");
  if (typeof messageId !== "string" || typeof chatId !== "string") {
    return { error: DRAFT_COPY.app.unsendFailed };
  }

  const { error } = await supabase.rpc("unsend_message", { p_message_id: messageId });
  if (error) {
    return {
      error:
        error.code === "42501"
          ? DRAFT_COPY.app.unsendRefused
          : DRAFT_COPY.app.unsendFailed,
    };
  }

  // The thread, and the inbox preview which quotes the last message.
  revalidatePath(`/app/chats/${chatId}`);
  revalidatePath("/app/inbox");
  return { error: null };
}
