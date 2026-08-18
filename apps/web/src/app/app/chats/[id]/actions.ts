"use server";

import { revalidatePath } from "next/cache";

import { DEFAULT_CLOSURE_TEMPLATE_INDEX, DRAFT_COPY } from "@plusone/config";
import { fuse, tone } from "@plusone/logic";

import { getServerSupabase } from "@/lib/supabase";
import { describeViolations } from "@/lib/tone-messages";
import { memberFacingError } from "@/lib/rpc-error";
import type { ChatState } from "./state";
import { redirect } from "next/navigation";

const C = DRAFT_COPY.app;

export async function sendMessage(_prev: ChatState, formData: FormData): Promise<ChatState> {
  const chatId = String(formData.get("chat_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: null };

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  // Whether this chat still accepts messages is decided by RLS
  // (chat_accepts_messages), not here. A closed chat rejects the insert.
  const { error } = await supabase
    .from("messages")
    .insert({ chat_id: chatId, sender_id: auth.user.id, body });

  if (error) {
    // A closed chat is not a failed send, and saying so leaves the member
    // typing into a screen that will never accept anything. The wall itself is
    // right — the RLS with-check refuses the insert — but every failure
    // collapsed to one string AND returned before revalidatePath, so the page
    // kept rendering the composer, the recorder and the close control against a
    // chat that had already ended and had a closure note waiting.
    //
    // 42501 is a policy refusal. Revalidating swaps the whole surface for the
    // closed state on the next render.
    if (error.code === "42501") {
      revalidatePath(`/app/chats/${chatId}`);
      return { error: C.chatClosedMidSend };
    }
    return { error: "That didn't send." };
  }
  revalidatePath(`/app/chats/${chatId}`);
  return { error: null };
}

/** §5.2 — messages_voice_len caps a note at 120 seconds. */
const MAX_VOICE_SECONDS = 120;
const VOICE_TYPES = ["audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/aac"];

/**
 * A voice note (§10, never-cut list).
 *
 * The row is written FIRST and the audio uploaded to a path built from its id.
 * The other order needs a path invented before there is anything to name it
 * after, and leaves an orphaned object whenever the insert then fails. If the
 * upload fails the row is removed, so a message never exists that plays
 * silence.
 */
export async function sendVoiceNote(_prev: ChatState, formData: FormData): Promise<ChatState> {
  const chatId = String(formData.get("chat_id") ?? "");
  const seconds = Math.round(Number(formData.get("seconds") ?? 0));
  const audio = formData.get("audio");

  if (!(audio instanceof File) || audio.size === 0) return { error: "Nothing recorded." };
  if (!VOICE_TYPES.includes(audio.type)) return { error: "That audio format is not supported." };
  if (!Number.isFinite(seconds) || seconds < 1) return { error: "That recording was too short." };
  if (seconds > MAX_VOICE_SECONDS) return { error: "Voice notes cap at two minutes." };

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  // Whether this chat still accepts messages is RLS's decision, here and on the
  // storage object. A closed chat rejects both.
  //
  // ONE write, with the real path.
  //
  // This used to insert with voice_note_path = 'pending', upload, then UPDATE
  // the row to the real path. Members hold `select, insert` on messages and
  // nothing else — §5.2 makes them immutable — so that update was refused every
  // time and its result was never checked. Every voice note in the database
  // pointed at 'pending' and none could be played. The rollback had the same
  // flaw: .delete() on messages, which members also cannot do.
  //
  // So the id is minted here, the audio goes up under its final name, and the
  // row is written once. The upload is first because a failed insert leaves an
  // orphaned object, which 20260817000600 lets us remove, whereas a failed
  // upload after the row exists leaves a message that plays silence — the thing
  // the bucket's missing delete policy was protecting against.
  const messageId = crypto.randomUUID();
  const extension = audio.type.split("/")[1]?.split(";")[0] ?? "webm";
  const path = `${chatId}/${messageId}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("voice-notes")
    .upload(path, audio, { contentType: audio.type });

  if (uploadError) return { error: "That didn't send." };

  const { error: insertError } = await supabase.from("messages").insert({
    id: messageId,
    chat_id: chatId,
    sender_id: auth.user.id,
    voice_note_path: path,
    voice_note_seconds: seconds,
  });

  if (insertError) {
    // Now removable, because no message points at it.
    await supabase.storage.from("voice-notes").remove([path]);
    return { error: "That didn't send." };
  }

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
    return {
      error: "A plan needs a day, a rough time, and a place — or video.",
    };
  }

  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("propose_date_plan", {
    p_chat_id: chatId,
    p_plan: plan,
  });
  if (error) return { error: memberFacingError(error, "That didn't work. Try again.") };

  revalidatePath(`/app/chats/${chatId}`);
  return { error: null };
}

export async function confirmPlan(_prev: ChatState, formData: FormData): Promise<ChatState> {
  const chatId = String(formData.get("chat_id") ?? "");
  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("confirm_date_plan", {
    p_chat_id: chatId,
  });
  if (error) return { error: memberFacingError(error, "That didn't work. Try again.") };
  revalidatePath(`/app/chats/${chatId}`);
  return { error: null };
}

/** §6.2 — cancelling re-arms the fuse at +72h rather than closing the chat. */
export async function cancelPlan(_prev: ChatState, formData: FormData): Promise<ChatState> {
  const chatId = String(formData.get("chat_id") ?? "");
  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("cancel_date_plan", {
    p_chat_id: chatId,
  });
  if (error) return { error: memberFacingError(error, "That didn't work. Try again.") };
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

  if (error) return { error: memberFacingError(error, "That didn't work. Try again.") };
  revalidatePath(`/app/chats/${chatId}`);
  revalidatePath("/app/chats");
  return { error: null };
}
