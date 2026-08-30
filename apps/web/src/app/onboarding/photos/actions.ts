"use server";

import { revalidatePath } from "next/cache";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";

import { nextRoute, requireStep } from "@/lib/onboarding";
import {
  MAX_PHOTOS,
  MAX_UPLOAD_BYTES,
  isAcceptableUpload,
  lowestFreeSlot,
} from "@/lib/photo-limits";
import { processPhoto } from "@/lib/photos";
import { getServerSupabase } from "@/lib/supabase";
import type { PhotosState } from "./state";

const E = DRAFT_COPY.photos.errors;
const BUCKET = "photos";

/**
 * Uploads one photo, storing a full and a blurred object.
 *
 * The blurred variant is generated HERE, at upload, and stored as its own
 * object. Decision #19 and the privacy policy both say the blur happens before
 * the image is sent; doing it as a CSS filter or an on-read transform would
 * mean shipping the real photo to someone who has not connected, and would make
 * that sentence false.
 *
 * Every check runs again on this side. The file input's `accept` and the
 * bucket's own limits are conveniences, not controls.
 */
export async function uploadPhoto(
  _previous: PhotosState,
  formData: FormData,
): Promise<PhotosState> {
  const { userId } = await requireStep("photos");

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: E.required };
  if (file.size > MAX_UPLOAD_BYTES) return { error: E.tooLarge };
  if (!isAcceptableUpload(file.type, file.size)) return { error: E.wrongType };

  const supabaseForCount = await getServerSupabase();
  const { data: heldRows } = await supabaseForCount
    .from("profile_photos")
    .select("position")
    .eq("user_id", userId);
  const held = heldRows?.length ?? 0;

  // Refused here, not by the constraint.
  //
  // `profile_photos_position_range` CHECKs `position between 0 and 5`, so a
  // seventh row is impossible either way — but reaching it that way meant
  // paying for three image transforms and three storage writes first, then
  // rolling all of them back and answering "that did not upload, try again",
  // which is advice that could never work. The browser caps the picker too;
  // this is the wall, that is the courtesy.
  if (held >= MAX_PHOTOS) return { error: E.full(MAX_PHOTOS) };

  let processed;
  try {
    // Also the real content check: anything sharp cannot decode is not an
    // image, whatever its declared type says.
    processed = await processPhoto(Buffer.from(await file.arrayBuffer()));
  } catch {
    return { error: E.wrongType };
  }

  const supabase = await getServerSupabase();

  // The first path segment is the owner — that is what the storage policies
  // check, so it is not decoration.
  const id = randomUUID();
  const fullPath = `${userId}/${id}.webp`;
  const cardPath = `${userId}/${id}-card.webp`;
  const blurredPath = `${userId}/${id}-blurred.webp`;

  const uploads = await Promise.all([
    supabase.storage.from(BUCKET).upload(fullPath, processed.full, { contentType: "image/webp" }),
    supabase.storage.from(BUCKET).upload(cardPath, processed.card, { contentType: "image/webp" }),
    supabase.storage
      .from(BUCKET)
      .upload(blurredPath, processed.blurred, { contentType: "image/webp" }),
  ]);

  if (uploads.some((u) => u.error)) {
    // Never leave a half-uploaded set behind: a full object with no blurred
    // counterpart is a photo with no private variant to fall back to.
    await supabase.storage.from(BUCKET).remove([fullPath, cardPath, blurredPath]);
    return { error: E.uploadFailed };
  }

  // The LOWEST FREE slot, not the count.
  //
  // `position: count` was a bug the moment photos could be deleted. Positions
  // are a set with holes in it, not a length: delete the first of three and the
  // rows left are 1 and 2, so a count of 2 picks position 2 — which exists —
  // and `unique (user_id, position)` refuses the insert. The member saw "that
  // did not upload", correctly, forever, while three slots stood empty. It only
  // ever worked because nothing could delete a photo.
  //
  // Re-read rather than reusing the rows from the cap check: the transforms and
  // three storage uploads above take long enough for another tab to have taken
  // a slot.
  const insertAt = async (): Promise<{ error: unknown }> => {
    const { data: rows } = await supabase
      .from("profile_photos")
      .select("position")
      .eq("user_id", userId);

    const slot = lowestFreeSlot((rows ?? []).map((row) => row.position as number));
    if (slot === null) return { error: { code: "FULL" } };

    return await supabase.from("profile_photos").insert({
      user_id: userId,
      storage_path: fullPath,
      card_path: cardPath,
      blurred_path: blurredPath,
      position: slot,
    });
  };

  let { error } = await insertAt();
  // 23505 is `unique (user_id, position)`: another tab took the slot between
  // the read and the write. Reading again is the whole fix — retried once,
  // because a second collision is a pattern, not a race.
  if (error && (error as { code?: string }).code === "23505") ({ error } = await insertAt());
  if (error && (error as { code?: string }).code === "FULL") {
    await supabase.storage.from(BUCKET).remove([fullPath, cardPath, blurredPath]);
    return { error: E.full(MAX_PHOTOS) };
  }

  if (error) {
    // All three, not two: the card variant was being left behind, so a failed
    // insert orphaned an object nothing would ever reference or purge.
    await supabase.storage.from(BUCKET).remove([fullPath, cardPath, blurredPath]);
    return { error: E.uploadFailed };
  }

  // Without this the step dead-ends.
  //
  // The screen is server-rendered from a count: page.tsx computes `uploaded`
  // and passes `canContinue={uploaded > 0}`, and the Continue button is
  // disabled until that is true. A Server Action that neither redirects nor
  // revalidates does not re-render the route — the Next 16 docs say so in as
  // many words — so the photo uploaded, the count stayed at zero, the
  // confirmation line never appeared, and Continue stayed grey forever.
  // The profile too, which is where these are actually managed now. It
  // renders the member's own face beside their name from photos[0], and that
  // heading sat on the previous picture until somebody reloaded by hand.
  for (const path of ["/onboarding/photos", "/app/profile"]) revalidatePath(path);
  return { error: null };
}

export async function savePhotoPrivacy(
  _previous: PhotosState,
  formData: FormData,
): Promise<PhotosState> {
  const { userId } = await requireStep("photos");

  const choice = formData.get("photo_privacy");
  const privacy = choice === "blurred_until_connected" ? "blurred_until_connected" : "clear";

  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("profiles")
    .update({ photo_privacy: privacy })
    .eq("id", userId);

  if (error) return { error: "That didn't save. Try again." };

  redirect(nextRoute("photos"));
}

/**
 * One photo's own privacy (server 18b).
 *
 * `null` means follow `profiles.photo_privacy`, which is the free model and
 * what every row had before this existed.
 *
 * The premium check here is COURTESY, not the wall. `profile_photos` carries a
 * whole-table update grant to `authenticated` (20260813000700), so a member can
 * PATCH this column straight through PostgREST without going near this action —
 * which is why 20260829002000 puts a trigger on the table. This check exists so
 * the UI can say something useful instead of surfacing a 42501.
 *
 * Clearing an override is deliberately NOT gated. A member whose subscription
 * has lapsed must still be able to return a photo to the profile-wide setting;
 * refusing that would strand them in a state they can no longer edit. Nothing
 * clears these automatically — see the migration for why that direction is the
 * one that matters.
 *
 * ── the third site of one principle, and the rule that resolves all three ────
 *
 * There are now three lapse rules in this app and they do NOT prescribe the
 * same action, which is why each has to name the others:
 *
 *   photo overrides (here)   KEPT on a lapse
 *   incognito (18a)          KEPT on a lapse — set_incognito gates ON only
 *   paid filters (18d)       DROPPED on a lapse — parseBrowseFilters skips them
 *
 * "Keep" and "drop" are both wrong as the rule. The principle underneath is
 * WHICHEVER DIRECTION DOES NOT INCREASE THE MEMBER'S OWN EXPOSURE. Dropping a
 * filter exposes nobody — it shows the viewer more people. Dropping incognito,
 * or clearing a photo override back to a clear profile setting, exposes the
 * member. One control acts on what a member SEES, the others on WHO SEES THEM,
 * so one principle points two ways.
 *
 * This site was written before the principle was articulated and obeys it
 * anyway, which is the reason to trust the formulation rather than treat it as
 * a story told after the fact.
 *
 * The worst available failure in this product lives one wrong generalisation
 * away: applying the filter rule here would un-blur photographs of somebody who
 * is ill, because their card expired.
 */
export async function setPhotoPrivacy(
  photoId: string,
  privacy: "clear" | "blurred_until_connected" | null,
): Promise<{ ok: boolean; reason?: "premium" }> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false };

  if (privacy !== null) {
    const { data: isPremium } = await supabase.rpc("i_am_premium");
    if (!isPremium) return { ok: false, reason: "premium" };
  }

  const { error } = await supabase
    .from("profile_photos")
    .update({ photo_privacy: privacy })
    .eq("id", photoId)
    .eq("user_id", auth.user.id);

  if (error) return { ok: false };

  for (const path of ["/onboarding/photos", "/app/profile"]) revalidatePath(path);
  return { ok: true };
}

/**
 * Removes one of the member's own photos, and the three objects behind it.
 *
 * There was no way to remove a photo at all. The step showed a count and no way
 * to change what it was counting, so one wrong picture meant a new account —
 * and with a ceiling of six, a member who filled it had no way to make room.
 *
 * The row goes first. If the storage removal fails afterwards the member still
 * sees the photo gone, and what is left behind is three unreferenced objects
 * the purge job already knows how to sweep — the other order would show them a
 * photo that no longer exists anywhere.
 */
export async function deletePhoto(
  _previous: PhotosState,
  formData: FormData,
): Promise<PhotosState> {
  const { userId } = await requireStep("photos");

  const id = String(formData.get("photo_id") ?? "");
  if (!id) return { error: E.uploadFailed };

  const supabase = await getServerSupabase();
  // `eq(user_id)` as well as the id, so a crafted body cannot name somebody
  // else's photo. RLS says the same thing; this says it here too.
  const { data: row, error } = await supabase
    .from("profile_photos")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("storage_path, card_path, blurred_path")
    .maybeSingle();

  if (error) return { error: E.uploadFailed };
  // Already gone. Not a failure — a member who double-taps Remove should not be
  // told something went wrong.
  if (!row) {
    // The profile too, which is where these are actually managed now. It
    // renders the member's own face beside their name from photos[0], and that
    // heading sat on the previous picture until somebody reloaded by hand.
    for (const path of ["/onboarding/photos", "/app/profile"]) revalidatePath(path);
    return { error: null };
  }

  const paths = [row.storage_path, row.card_path, row.blurred_path].filter(
    (path): path is string => typeof path === "string" && path.length > 0,
  );
  if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);

  // The profile too, which is where these are actually managed now. It
  // renders the member's own face beside their name from photos[0], and that
  // heading sat on the previous picture until somebody reloaded by hand.
  for (const path of ["/onboarding/photos", "/app/profile"]) revalidatePath(path);
  return { error: null };
}
