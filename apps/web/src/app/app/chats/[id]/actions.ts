"use server";

import { revalidatePath } from "next/cache";

import { DEFAULT_CLOSURE_TEMPLATE_INDEX } from "@plusone/config";
import { fuse, tone } from "@plusone/logic";

import { getServerSupabase } from "@/lib/supabase";
import { describeViolations } from "@/lib/tone-messages";

export type ChatState = { readonly error: string | null };
export const CHAT_INITIAL: ChatState = { error: null };

export async function sendMessage(_prev: ChatState, formData: FormData): Promise<ChatState> {
  const chatId = String(formData.get("chat_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: null };

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();

  // Whether this chat still accepts messages is decided by RLS
  // (chat_accepts_messages), not here. A closed chat rejects the insert.
  const { error } = await supabase
    .from("messages")
    .insert({ chat_id: chatId, sender_id: auth.user!.id, body });

  if (error) return { error: "That didn't send." };
  revalidatePath(`/app/chats/${chatId}`);
  return { error: null };
}

/**
 * §6.2 — a plan is concrete or it is not a plan: a day, a rough time, and a
 * place or video. The same three fields the reducer requires, checked here so
 * the member gets a sentence instead of a rejected RPC.
 */
export async function proposePlan(_prev: ChatState, formData: FormData): Promise<ChatState> {
  const chatId = String(formData.get("chat_id") ?? "");
  const plan = {
    date: String(formData.get("date") ?? "").trim(),
    time: String(formData.get("time") ?? "").trim(),
    place: String(formData.get("place") ?? "").trim(),
  };

  if (!fuse.isPlanComplete(plan)) {
    return { error: "A plan needs a day, a rough time, and a place — or video." };
  }

  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("propose_date_plan", { p_chat_id: chatId, p_plan: plan });
  if (error) return { error: error.message };

  revalidatePath(`/app/chats/${chatId}`);
  return { error: null };
}

export async function confirmPlan(_prev: ChatState, formData: FormData): Promise<ChatState> {
  const chatId = String(formData.get("chat_id") ?? "");
  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("confirm_date_plan", { p_chat_id: chatId });
  if (error) return { error: error.message };
  revalidatePath(`/app/chats/${chatId}`);
  return { error: null };
}

/** §6.2 — cancelling re-arms the fuse at +72h rather than closing the chat. */
export async function cancelPlan(_prev: ChatState, formData: FormData): Promise<ChatState> {
  const chatId = String(formData.get("chat_id") ?? "");
  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("cancel_date_plan", { p_chat_id: chatId });
  if (error) return { error: error.message };
  revalidatePath(`/app/chats/${chatId}`);
  return { error: null };
}

/**
 * Closing (§3.5, Decision #13).
 *
 * A template is always sent — the RPC defaults to index 0 — because silence is
 * the thing this product is built against. The optional personal line is
 * tone-checked first, and the rule that matters most there is that it cannot
 * mention anyone's status.
 */
export async function closeChat(_prev: ChatState, formData: FormData): Promise<ChatState> {
  const chatId = String(formData.get("chat_id") ?? "");
  const line = String(formData.get("personal_line") ?? "").trim();

  if (line) {
    const result = tone.checkTone(line);
    if (!result.ok) return { error: describeViolations(result.violations) };
  }

  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("close_chat", {
    p_chat_id: chatId,
    p_template: Number(formData.get("template") ?? DEFAULT_CLOSURE_TEMPLATE_INDEX),
    p_personal_line: line || null,
  });

  if (error) return { error: error.message };
  revalidatePath(`/app/chats/${chatId}`);
  revalidatePath("/app/chats");
  return { error: null };
}
