"use server";

import { redirect } from "next/navigation";

import { RADIUS } from "@plusone/config";

import { nextRoute, requireStep } from "@/lib/onboarding";
import { getServerSupabase } from "@/lib/supabase";
import type { RadiusState } from "./state";

const MIN = 5;
const MAX = 250;

export async function saveRadius(_previous: RadiusState, formData: FormData): Promise<RadiusState> {
  const { userId } = await requireStep("radius");

  const raw = Number(formData.get("radius"));
  // Re-clamped rather than trusted: the slider enforces the range, and a slider
  // enforces nothing. profiles_radius_range would reject an out-of-range value
  // anyway, but with a failed insert instead of a sentence.
  const radius = Number.isFinite(raw)
    ? Math.min(MAX, Math.max(MIN, Math.round(raw)))
    : RADIUS.defaultMi;

  const supabase = await getServerSupabase();

  // The point everything downstream measures from.
  //
  // Nothing in this app has ever written one, so distance_mi has been null for
  // every member against every other member — and `distance_mi <= radius` is
  // null, which is not true. Browse and the Drop have both been filtering an
  // empty set. A radius is not a setting without this; it is a number.
  //
  // Best effort by design: the browser prompt can be refused, and the IP
  // fallback can be absent off Vercel. A member with no location still finishes
  // onboarding — they simply match nobody until one arrives, which is the same
  // position they were in before and no worse.
  const lat = Number(formData.get("lat"));
  const lon = Number(formData.get("lon"));
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    // set_my_location refuses anything out of range, and the round_location
    // trigger coarsens whatever it accepts.
    await supabase.rpc("set_my_location", { p_lat: lat, p_lon: lon });
  }

  const { error } = await supabase
    .from("profiles")
    // The last §7.2 step, so this is where onboarding is done. The
    // profiles_complete_when_onboarded constraint checks the rest is present,
    // which makes a half-finished profile impossible to mark finished.
    .update({
      search_radius_mi: radius,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) return { error: "That didn't save. Try again." };

  redirect(nextRoute("radius"));
}
