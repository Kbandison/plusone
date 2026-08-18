"use server";

import { redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";

import { requireStep } from "@/lib/onboarding";
import { parsePreferences } from "@/lib/preferences";
import { getServerSupabase } from "@/lib/supabase";
import type { PreferencesState } from "./state";

/**
 * Saves who a member is and who they would like to meet (§12 gender, seeking).
 *
 * These two decide the whole Drop. drop_candidates filters mutually on gender
 * and on age, so this is the first screen in onboarding whose answers change
 * who a member will ever see.
 *
 * The reading lives in lib/preferences so the profile editor applies exactly
 * the same rules — two copies would be two sets of rules about who a member can
 * see, and only one of them would get the next fix.
 */
export async function savePreferences(
  _previous: PreferencesState,
  formData: FormData,
): Promise<PreferencesState> {
  const { userId } = await requireStep("preferences");

  const parsed = parsePreferences(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await getServerSupabase();
  const { error } = await supabase.from("profiles").update(parsed.values).eq("id", userId);

  // Checked, because supabase-js resolves rather than rejects: an unchecked
  // update reads as a success and sends the member to a step the resolver will
  // bounce them straight back from.
  if (error) return { error: DRAFT_COPY.preferences.errors.failed };

  redirect("/onboarding");
}
