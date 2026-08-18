"use server";

import { redirect } from "next/navigation";

import {
  DRAFT_COPY,
  FREQUENCY_LABELS,
  GENDER_LABELS,
  KIDS_LABELS,
  KIDS_PLAN_LABELS,
} from "@plusone/config";

import { requireStep } from "@/lib/onboarding";
import { getServerSupabase } from "@/lib/supabase";
import type { PreferencesState } from "./state";

const E = DRAFT_COPY.preferences.errors;

/** 18 is the floor everywhere in this product; the CHECK holds the same pair. */
const AGE_FLOOR = 18;
const AGE_CEILING = 120;

/**
 * One value, but only if it is one the enum actually holds.
 *
 * The form posts strings. A value the database does not know is a failed
 * update at the end of a filled-in form, and the member is told nothing useful
 * — so anything unrecognised becomes null here, which is "not stated" and is
 * a legal answer for every field except gender.
 */
function oneOf<T extends string>(
  value: FormDataEntryValue | null,
  allowed: Readonly<Record<T, string>>,
): T | null {
  const raw = typeof value === "string" ? value : "";
  return raw in allowed ? (raw as T) : null;
}

/** An age box: blank means no preference, and no preference is not zero. */
function ageOrNull(value: FormDataEntryValue | null): number | null | "invalid" {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw === "") return null;
  if (!/^\d{1,3}$/.test(raw)) return "invalid";
  const age = Number(raw);
  if (age < AGE_FLOOR || age > AGE_CEILING) return "invalid";
  return age;
}

/**
 * Saves who a member is and who they would like to meet (§12 gender, seeking).
 *
 * These two decide the whole Drop. drop_candidates filters mutually on gender
 * and on age, so this is the first screen in onboarding whose answers change
 * who a member will ever see — which is why gender is the one required field
 * and everything else may be left alone.
 */
export async function savePreferences(
  _previous: PreferencesState,
  formData: FormData,
): Promise<PreferencesState> {
  const { userId } = await requireStep("preferences");

  const gender = oneOf(formData.get("gender"), GENDER_LABELS);
  if (!gender) return { error: E.genderRequired };

  // Multi-select. Nothing chosen is "everyone", which is what the mutual filter
  // reads an empty array as — not "nobody", which would be a Drop of zero.
  const seeking = formData
    .getAll("seeking")
    .filter((value): value is string => typeof value === "string")
    .filter((value) => value in GENDER_LABELS);

  const ageMin = ageOrNull(formData.get("age_min"));
  const ageMax = ageOrNull(formData.get("age_max"));
  if (ageMin === "invalid" || ageMax === "invalid") return { error: E.ageRange };
  // The CHECK refuses this too. Caught here so it arrives as a sentence about
  // the two boxes rather than as a failed save with no explanation.
  if (ageMin !== null && ageMax !== null && ageMin > ageMax) return { error: E.ageOrder };

  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("profiles")
    .update({
      gender,
      seeking: [...new Set(seeking)],
      age_min: ageMin,
      age_max: ageMax,
      smokes: oneOf(formData.get("smokes"), FREQUENCY_LABELS),
      drinks: oneOf(formData.get("drinks"), FREQUENCY_LABELS),
      kids: oneOf(formData.get("kids"), KIDS_LABELS),
      kids_plan: oneOf(formData.get("kids_plan"), KIDS_PLAN_LABELS),
    })
    .eq("id", userId);

  // Checked, because supabase-js resolves rather than rejects: an unchecked
  // update reads as a success and sends the member to a step the resolver will
  // bounce them straight back from.
  if (error) return { error: E.failed };

  redirect("/onboarding");
}
