"use server";

import { revalidatePath } from "next/cache";

import { DRAFT_COPY } from "@plusone/config";
import { tone } from "@plusone/logic";

import { memberFacingError } from "@/lib/rpc-error";
import { getServerSupabase } from "@/lib/supabase";
import { describeViolations } from "@/lib/tone-messages";
import type { RoomState } from "./state";
import { redirect } from "next/navigation";

export async function joinRoom(_prev: RoomState, formData: FormData): Promise<RoomState> {
  const roomId = String(formData.get("room_id") ?? "");

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");
  const { error } = await supabase
    .from("room_members")
    .insert({ room_id: roomId, user_id: auth.user.id });

  // Already a member is not a failure.
  if (error && error.code !== "23505") return { error: "That didn't work. Try again." };

  revalidatePath(`/app/rooms/${roomId}`);
  return { error: null };
}

/**
 * Posting to a room.
 *
 * Tone-checked like every other member-written line, minus one rule. Rooms are
 * where newly diagnosed people arrive and where a cruel message does the most
 * damage, so contact-scraping, sexual content and insults are all still caught.
 *
 * What does NOT apply here is the condition rule. It exists because closure and
 * decline notes are delivered as notifications and §8 keeps condition words off
 * anyone's lock screen — but a room post never leaves the app. Enforcing it
 * here made every room refuse its own subject.
 *
 * Slow mode is enforced by the database. Checking it here as well would be a
 * second clock, and two clocks disagree.
 */
const C = DRAFT_COPY.app;

export async function postToRoom(_prev: RoomState, formData: FormData): Promise<RoomState> {
  const roomId = String(formData.get("room_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  // Says so, rather than returning success and doing nothing. The composer has
  // no `required` attribute, so an accidental Post — or one after the browser
  // cleared the field — produced no message, no error and no clue. The chat
  // composer already answers this; rooms did not.
  if (!body) return { error: C.emptyPost };

  // A room post does not leave the app, so the condition rule that protects a
  // closure note does not apply — see ToneOptions.allowConditionWords. Naming
  // your own diagnosis in the room named for it is the point of the room.
  const result = tone.checkTone(body, {
    maxChars: 2000,
    allowConditionWords: true,
  });
  if (!result.ok) return { error: describeViolations(result.violations) };

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");
  const { error } = await supabase
    .from("room_messages")
    .insert({ room_id: roomId, user_id: auth.user.id, body });

  // memberFacingError, not a blanket string. 20260817000800 raises
  // "slow mode: wait N more seconds" and rpc-error.ts was extended to allow it
  // precisely so the member is told how long is left — and this collapsed it
  // into "That didn't post.", which is the silent drop the trigger was written
  // to replace.
  if (error) return { error: memberFacingError(error, "That didn't post.") };

  revalidatePath(`/app/rooms/${roomId}`);
  return { error: null };
}
