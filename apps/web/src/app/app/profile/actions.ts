"use server";

import { revalidatePath } from "next/cache";

import {
  MAX_PROMPTS,
  PROMPT_ANSWER_MAX_CHARS,
  promptQuestion,
  type ProfilePromptAnswer,
} from "@plusone/config";
import { tone } from "@plusone/logic";

import { getServerSupabase } from "@/lib/supabase";
import { describeViolations } from "@/lib/tone-messages";

export type ProfileState = { readonly error: string | null; readonly message: string | null };
export const PROFILE_INITIAL: ProfileState = { error: null, message: null };

/**
 * §6.4 — the mode toggle. `switch_mode` holds the cooldown; this does not
 * re-check it, because one enforcement point is the point.
 */
export async function switchMode(_previous: ProfileState, formData: FormData): Promise<ProfileState> {
  const target = formData.get("mode") === "support_only" ? "support_only" : "dating";

  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("switch_mode", { p_mode: target });
  if (error) return { error: error.message, message: null };

  revalidatePath("/app/profile");
  revalidatePath("/app");
  return {
    error: null,
    message: target === "support_only" ? "You're in support-only mode." : "You're back in dating.",
  };
}

/**
 * Saving prompt answers (Decision #14).
 *
 * Tone-checked like every other member-written line. A prompt answer is read by
 * strangers deciding whether to reach out, and it is the one piece of free text
 * on a profile — which makes it the obvious place to put something that should
 * not be there.
 *
 * Unknown prompt ids are dropped rather than rejected: the id comes from a
 * select the client rendered, and a stale one after a prompt is retired should
 * not cost someone the rest of their answers.
 */
export async function savePrompts(_previous: ProfileState, formData: FormData): Promise<ProfileState> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(formData.get("prompts") ?? "[]"));
  } catch {
    return { error: "That didn't save. Try again.", message: null };
  }

  if (!Array.isArray(parsed)) return { error: "That didn't save. Try again.", message: null };

  const answers: ProfilePromptAnswer[] = [];
  for (const row of parsed.slice(0, MAX_PROMPTS)) {
    const id = String((row as ProfilePromptAnswer)?.id ?? "");
    const answer = String((row as ProfilePromptAnswer)?.answer ?? "").trim();
    if (!answer) continue;
    if (!promptQuestion(id)) continue;
    if (answer.length > PROMPT_ANSWER_MAX_CHARS) {
      return { error: "One of those answers is too long.", message: null };
    }

    const result = tone.checkTone(answer, { maxChars: PROMPT_ANSWER_MAX_CHARS });
    if (!result.ok) return { error: describeViolations(result.violations), message: null };

    answers.push({ id, answer });
  }

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("profiles")
    .update({ prompts: answers })
    .eq("id", auth.user!.id);

  if (error) return { error: "That didn't save. Try again.", message: null };

  revalidatePath("/app/profile");
  return { error: null, message: "Saved." };
}

export async function saveBio(_previous: ProfileState, formData: FormData): Promise<ProfileState> {
  const bio = String(formData.get("bio") ?? "").trim();

  if (bio) {
    const result = tone.checkTone(bio, { maxChars: 500 });
    if (!result.ok) return { error: describeViolations(result.violations), message: null };
  }

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("profiles")
    .update({ bio: bio || null })
    .eq("id", auth.user!.id);

  if (error) return { error: "That didn't save. Try again.", message: null };

  revalidatePath("/app/profile");
  return { error: null, message: "Saved." };
}
