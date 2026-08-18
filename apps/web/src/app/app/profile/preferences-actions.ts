"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";

import { parsePreferences } from "@/lib/preferences";
import { getServerSupabase } from "@/lib/supabase";
import type { PreferencesState } from "@/app/onboarding/preferences/state";

/**
 * The same answers, changed later.
 *
 * Who a member wants to meet is the single setting that decides everything they
 * ever see, and onboarding asking it once would have made it write-once — a
 * member whose circumstances changed would have had no way to say so short of a
 * new account.
 *
 * Same rules as the onboarding step, from the same parser. It differs only in
 * where it leaves you: onboarding continues, this stays put and says it saved.
 */
export async function updatePreferences(
  _previous: PreferencesState,
  formData: FormData,
): Promise<PreferencesState> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const parsed = parsePreferences(formData);
  if ("error" in parsed) return { error: parsed.error };

  const { error } = await supabase.from("profiles").update(parsed.values).eq("id", auth.user.id);
  if (error) return { error: DRAFT_COPY.preferences.errors.failed };

  // The Drop is built from these, so the pages that show it must not keep a
  // rendering made under the old answers.
  revalidatePath("/app/profile");
  revalidatePath("/app");
  return { error: null, saved: true };
}
