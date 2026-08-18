"use server";

import { revalidatePath } from "next/cache";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";

import { requireStep } from "@/lib/onboarding";
import { MAX_PHOTOS, MAX_UPLOAD_BYTES, isAcceptableUpload } from "@/lib/photo-limits";
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
  const { count: held } = await supabaseForCount
    .from("profile_photos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  // Refused here, not by the constraint.
  //
  // `profile_photos_position_range` CHECKs `position between 0 and 5`, so a
  // seventh row is impossible either way — but reaching it that way meant
  // paying for three image transforms and three storage writes first, then
  // rolling all of them back and answering "that did not upload, try again",
  // which is advice that could never work. The browser caps the picker too;
  // this is the wall, that is the courtesy.
  if ((held ?? 0) >= MAX_PHOTOS) return { error: E.full(MAX_PHOTOS) };

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

  // Re-read rather than reusing `held`: the transforms and three uploads above
  // take long enough that a second tab could have added one, and position is
  // what `unique (user_id, position)` is checking.
  const { count } = await supabase
    .from("profile_photos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  const { error } = await supabase.from("profile_photos").insert({
    user_id: userId,
    storage_path: fullPath,
    card_path: cardPath,
    blurred_path: blurredPath,
    position: count ?? 0,
  });

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
  revalidatePath("/onboarding/photos");
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

  redirect("/onboarding");
}
