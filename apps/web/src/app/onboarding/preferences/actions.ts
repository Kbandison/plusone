"use server";

import { redirect } from "next/navigation";

import { CONSENT_COPY_VERSION, DRAFT_COPY } from "@plusone/config";

import { nextRoute, requireStep } from "@/lib/onboarding";
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

  // The belief consent, recorded BEFORE the write it authorises.
  //
  // `profiles_beliefs_consent` refuses a disclosing religion or politics answer
  // without a row here, so the order is not a preference — the other way round
  // the trigger rejects the update and the tick is never stored. Idempotent:
  // (user_id, kind, copy_version) is unique, so a second save is a no-op rather
  // than a duplicate.
  //
  // Nothing here decides whether the consent is REQUIRED. The database does, on
  // the value being written, whichever path the write arrives on — a member can
  // PATCH these columns straight through PostgREST and a check in this action
  // would be decoration.
  if (formData.get("beliefsConsent") === "on") {
    await supabase
      .from("consents")
      .insert({ user_id: userId, kind: "beliefs", copy_version: CONSENT_COPY_VERSION.beliefs })
      .select()
      .maybeSingle();
  }

  const { error } = await supabase.from("profiles").update(parsed.values).eq("id", userId);

  // The trigger's refusal, turned into a sentence. 42501 here means a belief
  // was answered with the box unticked; anything else is an ordinary failure.
  if (error?.code === "42501") return { error: DRAFT_COPY.preferences.errors.beliefsConsent };

  // Checked, because supabase-js resolves rather than rejects: an unchecked
  // update reads as a success and sends the member to a step the resolver will
  // bounce them straight back from.
  if (error) return { error: DRAFT_COPY.preferences.errors.failed };

  redirect(nextRoute("preferences"));
}
