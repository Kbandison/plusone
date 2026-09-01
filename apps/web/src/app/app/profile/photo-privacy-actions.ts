"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getServerSupabase } from "@/lib/supabase";
import type { PhotosState } from "@/app/onboarding/photos/state";

/**
 * The same three-state photo privacy control, on the profile.
 *
 * Not the onboarding action, for exactly the reason radius-actions.ts gives
 * about its own — and this one had the bug that note exists to prevent.
 *
 * `savePhotoPrivacy` in onboarding ends in `redirect(nextRoute("photos"))`,
 * which is the radius step. The profile renders the same fieldset with
 * `settings`, where the radios auto-submit on change instead of waiting for a
 * Continue button. So a member on their own profile who chose "Blurred until
 * we connect" saved the setting and was then thrown into a step of an
 * onboarding flow they finished weeks ago. Reported by Kevin 2026-09-01.
 *
 * It also calls `requireStep("photos")`, which a finished member fails.
 *
 * ── shaped as a prop rather than a flag, deliberately ───────────────────────
 *
 * radius-form.tsx already settled this: the form takes the action it should
 * call, so onboarding imports exactly one and the profile imports exactly one.
 * A `settings` boolean threaded into a single action would put a redirect and
 * a requireStep in the same function as the branch that must do neither —
 * which is the shape that produced this bug. `settings` survives in the form
 * only as `save !== undefined`.
 */
export async function savePhotoPrivacySetting(
  _previous: PhotosState,
  formData: FormData,
): Promise<PhotosState> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const choice = formData.get("photo_privacy");
  const privacy = choice === "blurred_until_connected" ? "blurred_until_connected" : "clear";

  const { error } = await supabase
    .from("profiles")
    .update({ photo_privacy: privacy })
    .eq("id", auth.user.id);

  if (error) return { error: "That didn't save. Try again." };

  // The gallery above renders each photo's own override against this, and the
  // card everywhere else in the app is drawn from it. Without this the member
  // sees the radio move and nothing else change.
  revalidatePath("/app/profile");
  return { error: null };
}
