"use server";

import { redirect } from "next/navigation";

import { RADIUS } from "@plusone/config";

import { requireStep } from "@/lib/onboarding";
import { getServerSupabase } from "@/lib/supabase";

export type RadiusState = { readonly error: string | null };

const MIN = 5;
const MAX = 250;

export async function saveRadius(_previous: RadiusState, formData: FormData): Promise<RadiusState> {
  const { userId } = await requireStep("radius");

  const raw = Number(formData.get("radius"));
  // Re-clamped rather than trusted: the slider enforces the range, and a slider
  // enforces nothing. profiles_radius_range would reject an out-of-range value
  // anyway, but with a failed insert instead of a sentence.
  const radius = Number.isFinite(raw) ? Math.min(MAX, Math.max(MIN, Math.round(raw))) : RADIUS.defaultMi;

  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("profiles")
    // The last §7.2 step, so this is where onboarding is done. The
    // profiles_complete_when_onboarded constraint checks the rest is present,
    // which makes a half-finished profile impossible to mark finished.
    .update({ search_radius_mi: radius, onboarded_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) return { error: "That didn't save. Try again." };

  redirect("/onboarding");
}
