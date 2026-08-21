"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { RADIUS } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";
import type { RadiusState } from "@/app/onboarding/radius/state";

const MIN = 5;
const MAX = 250;

/**
 * The same slider, on the profile.
 *
 * Not the onboarding action. That one calls requireStep("radius"), which a
 * finished member fails, and it ends in a redirect to the next step — so
 * reusing it would have thrown a member out of their own profile and into a
 * flow they completed weeks ago.
 *
 * It also does not ask the browser where you are. Onboarding asks at the moment
 * the question first means something; on a settings screen a permission prompt
 * on every drag of a slider is a thing people learn to dismiss. The location
 * already on the row is the one that stands.
 */
export async function saveRadiusSetting(
  _previous: RadiusState,
  formData: FormData,
): Promise<RadiusState> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  // Re-clamped rather than trusted, for the same reason the step does it: the
  // slider enforces the range, and a slider enforces nothing.
  const raw = Number(formData.get("radius"));
  const radius = Number.isFinite(raw)
    ? Math.min(MAX, Math.max(MIN, Math.round(raw)))
    : RADIUS.defaultMi;

  const { error } = await supabase
    .from("profiles")
    .update({ search_radius_mi: radius })
    .eq("id", auth.user.id);

  if (error) return { error: "That didn't save. Try again." };

  // Who is in the Drop and who is in Browse both read this number.
  for (const path of ["/app", "/app/browse", "/app/profile"]) revalidatePath(path);
  return { error: null };
}
