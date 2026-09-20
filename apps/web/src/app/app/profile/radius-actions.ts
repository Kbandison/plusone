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

/**
 * Move where the app thinks you are.
 *
 * ── this was impossible until 2026-09-20 ────────────────────────────────────
 *
 * `set_my_location` had exactly one caller — the onboarding step — so whatever
 * the browser said that day was permanent. Somebody who refused the prompt, was
 * on a VPN, or simply moved had no way to correct it, and the app matches on
 * that column: a wrong location is a Drop full of strangers three states away,
 * with no control anywhere that would fix it.
 *
 * ── deliberately NOT attached to the slider ────────────────────────────────
 *
 * `saveRadiusSetting` refuses to ask the browser, and it is right to: "a
 * permission prompt on every drag of a slider is a thing people learn to
 * dismiss". This is its own button, pressed on purpose, which is the only shape
 * that asks for a location permission honestly.
 *
 * The bounds live in `set_my_location`, which drops anything out of range
 * rather than storing it — a wrong location is worse than none, because none
 * reads as "no matches near you" and wrong reads as a match six thousand miles
 * away. Nothing is re-checked here; two copies of that rule is how a screen
 * starts writing what the RPC would refuse.
 */
export async function updateMyLocation(
  _previous: RadiusState,
  formData: FormData,
): Promise<RadiusState> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const lat = Number(formData.get("lat"));
  const lon = Number(formData.get("lon"));
  // The device said nothing. Not an error the member caused, and not a state
  // worth a red message — the button simply did not get an answer.
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { error: "We could not get your location. Check the permission and try again." };
  }

  // Not the service client: set_my_location reads auth.uid(), so it must run as
  // the member. A definer wrapper here would let one account move another.
  const { error } = await supabase.rpc("set_my_location", { p_lat: lat, p_lon: lon });
  if (error) return { error: "That didn't save. Try again." };

  // Every surface that reads distance.
  for (const path of ["/app", "/app/browse", "/app/profile"]) revalidatePath(path);
  return { error: null };
}
