"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";

import { requireStep } from "@/lib/onboarding";
import { MAX_UPLOAD_BYTES, isAcceptableUpload } from "@/lib/photo-limits";
import { processPhoto } from "@/lib/photos";
import { getServerSupabase } from "@/lib/supabase";

const E = DRAFT_COPY.photos.errors;
const BUCKET = "photos";

export type PhotosState = { readonly error: string | null };
export const PHOTOS_INITIAL: PhotosState = { error: null };

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
export async function uploadPhoto(_previous: PhotosState, formData: FormData): Promise<PhotosState> {
  const { userId } = await requireStep("photos");

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: E.required };
  if (file.size > MAX_UPLOAD_BYTES) return { error: E.tooLarge };
  if (!isAcceptableUpload(file.type, file.size)) return { error: E.wrongType };

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
  const blurredPath = `${userId}/${id}-blurred.webp`;

  const uploads = await Promise.all([
    supabase.storage.from(BUCKET).upload(fullPath, processed.full, { contentType: "image/webp" }),
    supabase.storage
      .from(BUCKET)
      .upload(blurredPath, processed.blurred, { contentType: "image/webp" }),
  ]);

  if (uploads.some((u) => u.error)) {
    // Never leave a half-uploaded pair behind: a full object with no blurred
    // counterpart is a photo with no private variant to fall back to.
    await supabase.storage.from(BUCKET).remove([fullPath, blurredPath]);
    return { error: E.uploadFailed };
  }

  const { count } = await supabase
    .from("profile_photos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  const { error } = await supabase.from("profile_photos").insert({
    user_id: userId,
    storage_path: fullPath,
    blurred_path: blurredPath,
    position: count ?? 0,
  });

  if (error) {
    await supabase.storage.from(BUCKET).remove([fullPath, blurredPath]);
    return { error: E.uploadFailed };
  }

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
