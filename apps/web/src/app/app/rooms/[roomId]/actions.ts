"use server";

import { revalidatePath } from "next/cache";

import { DRAFT_COPY } from "@plusone/config";
import { tone } from "@plusone/logic";

import { memberFacingError } from "@/lib/rpc-error";
import { randomUUID } from "node:crypto";

import { getServerSupabase } from "@/lib/supabase";
import { isAcceptableUpload, processRoomImage } from "@/lib/photos";
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

/**
 * Stores an image for a post, if one was attached.
 *
 * The id is minted here rather than taken from the row, because the row does
 * not exist yet — the path has to be known before the insert that references
 * it. It names the ROOM and the message and nothing else: a path carrying a
 * user id would hand the author of an anonymous post to anyone who saw the
 * URL, which is precisely what room_feed's projection exists to prevent.
 *
 * Returns null when there is no file, and throws the member-facing reason when
 * there is one that will not do.
 */
async function storeRoomImage(
  supabase: Awaited<ReturnType<typeof getServerSupabase>>,
  roomId: string,
  file: File | null,
): Promise<{ path: string } | { error: string } | null> {
  if (!file || file.size === 0) return null;

  if (!isAcceptableUpload(file.type, file.size)) return { error: C.imageRejected };

  let processed: Buffer;
  try {
    // Re-encoded before it is stored, which is what drops the GPS coordinates,
    // the device serial and the timestamp the camera wrote in. See
    // processRoomImage.
    processed = await processRoomImage(Buffer.from(await file.arrayBuffer()));
  } catch {
    // sharp refusing to decode it is also the check that it is an image at all
    // rather than something wearing an image's content type.
    return { error: C.imageRejected };
  }

  const path = `${roomId}/${randomUUID()}.webp`;
  const { error } = await supabase.storage
    .from("room-images")
    .upload(path, processed, { contentType: "image/webp" });

  if (error) return { error: C.imageRejected };
  return { path };
}

export async function postToRoom(_prev: RoomState, formData: FormData): Promise<RoomState> {
  const roomId = String(formData.get("room_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  // Says so, rather than returning success and doing nothing. The composer has
  // no `required` attribute, so an accidental Post — or one after the browser
  // cleared the field — produced no message, no error and no clue. The chat
  // composer already answers this; rooms did not.
  const file = formData.get("image");
  // A post with a picture and no words is a post. Everything else still needs
  // saying: an empty box and no file is a Post button that did nothing.
  if (!body && !(file instanceof File && file.size > 0)) return { error: C.emptyPost };

  // A room post does not leave the app, so the condition rule that protects a
  // closure note does not apply — see ToneOptions.allowConditionWords. Naming
  // your own diagnosis in the room named for it is the point of the room.
  // Only when there is something to check. An image-only post has no words,
  // and running the rules over an empty string is a rule about a string nobody
  // wrote — harmless today, because checkTone happens to return ok for "", and
  // one added minimum-length rule away from refusing every picture.
  if (body) {
    const result = tone.checkTone(body, {
      maxChars: 2000,
      allowConditionWords: true,
    });
    if (!result.ok) return { error: describeViolations(result.violations) };
  }

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");
  // The member's choice, per post. Nothing about a member is anonymous — a
  // post is, and only the one they ticked the box on.
  const anonymous = formData.get("anonymous") === "on";

  const { error } = await supabase
    .from("room_messages")
    .insert({ room_id: roomId, user_id: auth.user.id, body, anonymous });

  // memberFacingError, not a blanket string. 20260817000800 raises
  // "slow mode: wait N more seconds" and rpc-error.ts was extended to allow it
  // precisely so the member is told how long is left — and this collapsed it
  // into "That didn't post.", which is the silent drop the trigger was written
  // to replace.
  if (error) return { error: memberFacingError(error, "That didn't post.") };

  revalidatePath(`/app/rooms/${roomId}`);
  return { error: null };
}

/**
 * Liking, and unliking, which is the same press.
 *
 * Returns what is now true rather than nothing.
 *
 * The first version returned void and left the button optimistic — and
 * useOptimistic discards its value the moment the transition ends, falling back
 * to props that nothing had revalidated. Press like, see 1, press again, see 0,
 * watch it return to 1. The optimistic number was right and the stale one won.
 *
 * revalidatePath would also fix it and is the wrong tool: re-rendering a
 * hundred-post feed to learn one number the RPC already returned is a lot of
 * work for the control a member presses most.
 */
export async function toggleLike(
  messageId: string,
): Promise<{ liked: boolean; count: number } | null> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const { data, error } = await supabase
    .rpc("toggle_room_like", { p_message_id: messageId })
    .maybeSingle<{ liked: boolean; like_count: number }>();

  // Null rather than a throw: the button reverts to what the server last said,
  // which is the same correction a throw would produce and does not put an
  // unhandled error in the console of somebody who double-tapped.
  if (error || !data) return null;
  return { liked: data.liked, count: data.like_count };
}

/**
 * A comment, which is a post with a parent.
 *
 * The same action as postToRoom in every respect that matters — the tone check,
 * the anonymity choice, the slow-mode trigger — because a comment IS a post.
 * Room id is deliberately not taken from the client: enforce_flat_comments sets
 * it from the parent, so a comment cannot be filed under a room its post is not
 * in.
 */
export async function postComment(_prev: RoomState, formData: FormData): Promise<RoomState> {
  const parentId = String(formData.get("parent_id") ?? "");
  const roomId = String(formData.get("room_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: C.emptyPost };

  const result = tone.checkTone(body, { maxChars: 2000, allowConditionWords: true });
  if (!result.ok) return { error: describeViolations(result.violations) };

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const { error } = await supabase.from("room_messages").insert({
    room_id: roomId,
    parent_id: parentId,
    user_id: auth.user.id,
    body,
    anonymous: formData.get("anonymous") === "on",
  });

  if (error) return { error: memberFacingError(error, "That didn't post.") };

  revalidatePath(`/app/rooms/${roomId}/${parentId}`);
  revalidatePath(`/app/rooms/${roomId}`);
  return { error: null };
}
