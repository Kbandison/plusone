"use server";

import { redirect } from "next/navigation";

import { CONNECTS, promptQuestion } from "@plusone/config";
import { tone } from "@plusone/logic";

import { getServerSupabase } from "@/lib/supabase";
import { describeViolations } from "@/lib/tone-messages";

export type ConnectState = { readonly error: string | null };
export const CONNECT_INITIAL: ConnectState = { error: null };

const MAX_REPLY = 500;

/**
 * Sending a connect (Decision #14).
 *
 * A connect IS a reply to a specific prompt — `connects.prompt_id` and
 * `prompt_reply` are both NOT NULL, so there is no such thing here as a wave.
 * That is the mechanic that stops swipe-and-spray, and it only works if the
 * surface makes the reply the whole interaction.
 *
 * Every wall lives in `create_connect` and the trigger behind it, which run
 * whatever path the insert arrives by. This checks the reply, not the right to
 * send it.
 */
export async function sendConnect(
  _previous: ConnectState,
  formData: FormData,
): Promise<ConnectState> {
  const targetId = String(formData.get("target_id") ?? "");
  const promptId = String(formData.get("prompt_id") ?? "");
  const reply = String(formData.get("reply") ?? "").trim();
  const source = String(formData.get("source") ?? "browse");
  const roomId = String(formData.get("room_id") ?? "") || null;

  if (!promptQuestion(promptId)) return { error: "Choose a prompt to reply to." };
  if (!reply) return { error: "Write a reply — that is the connect." };
  if (reply.length > MAX_REPLY) return { error: `Keep it under ${MAX_REPLY} characters.` };

  // The first thing a stranger reads from you. Held to the same bar as a
  // closure note, and for the same reason.
  const result = tone.checkTone(reply, { maxChars: MAX_REPLY });
  if (!result.ok) return { error: describeViolations(result.violations) };

  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("create_connect", {
    p_target_id: targetId,
    p_prompt_id: promptId,
    p_prompt_reply: reply,
    p_source: source,
    p_room_id: roomId,
  });

  if (error) {
    // A refusal here is a wall doing its job — the target may be support-only,
    // in another community, or the budget may be spent. The message stays vague
    // on purpose: a specific one would tell someone which wall they hit, which
    // is the probe leak by another route.
    return { error: "That connect could not be sent right now." };
  }

  redirect("/app/inbox");
}

export const PERSONAL_LINE_MAX = CONNECTS.personalLineMaxChars;
