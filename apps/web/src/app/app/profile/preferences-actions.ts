"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";

import { EXTENDED_PREFERENCE_COLUMNS, parsePreferences } from "@/lib/preferences";
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

  /**
   * If the eight new columns are not there yet, save the rest anyway.
   *
   * Migrations here are applied BY HAND and are Kevin's call, so code reaches
   * production before the schema does. An update naming a column that does not
   * exist fails ENTIRELY — so between this deploying and 20260829000100 being
   * applied, a member changing who they want to meet would be told "that did
   * not save", and it would be true of gender, seeking and their age range as
   * well as of the eight they could not see anyway.
   *
   * PGRST204 is PostgREST's "column not found in schema cache"; 42703 is
   * Postgres's own undefined_column, which surfaces when the cache is warm and
   * the column still is not there. Anything else is a real failure and is
   * reported as one — this must not become a catch-all that swallows a genuine
   * write error and tells the member it saved.
   */
  if (error && (error.code === "PGRST204" || error.code === "42703")) {
    const core = { ...parsed.values };
    for (const column of EXTENDED_PREFERENCE_COLUMNS) delete core[column];
    const retry = await supabase.from("profiles").update(core).eq("id", auth.user.id);
    if (retry.error) return { error: DRAFT_COPY.preferences.errors.failed };
  } else if (error) {
    return { error: DRAFT_COPY.preferences.errors.failed };
  }

  // The Drop is built from these, so the pages that show it must not keep a
  // rendering made under the old answers.
  revalidatePath("/app/profile");
  revalidatePath("/app");
  return { error: null, saved: true };
}
