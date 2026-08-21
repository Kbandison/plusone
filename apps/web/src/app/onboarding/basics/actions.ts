"use server";

import { redirect } from "next/navigation";

import { DRAFT_COPY, MAX_DISPLAY_NAME } from "@plusone/config";
import { profile } from "@plusone/logic";

import { nextRoute, requireStep } from "@/lib/onboarding";
import { getServerSupabase } from "@/lib/supabase";
import type { BasicsState } from "./state";

const E = DRAFT_COPY.basics.errors;

/**
 * Saves display name and date of birth, creating the profile row.
 *
 * The 18+ rule is checked here AND enforced by profiles_adult in the database.
 * The database is what makes it true; this exists so a member gets a sentence
 * rather than a failed insert.
 *
 * `today` is read on the server. A client-supplied date would let anyone be
 * eighteen by changing their clock.
 */
export async function saveBasics(_previous: BasicsState, formData: FormData): Promise<BasicsState> {
  const { userId } = await requireStep("profile_basics");

  const displayName = String(formData.get("display_name") ?? "").trim();
  const birthdate = String(formData.get("birthdate") ?? "").trim();

  if (!displayName) return { error: E.nameRequired };
  if (displayName.length > MAX_DISPLAY_NAME) return { error: E.nameTooLong };
  if (!birthdate) return { error: E.birthdateRequired };

  const today = new Date().toISOString().slice(0, 10);
  if (profile.parseIsoDate(birthdate) === null) return { error: E.birthdateInvalid };
  if (!profile.isAdult(birthdate, today)) return { error: E.tooYoung };

  const supabase = await getServerSupabase();
  // UPDATE, not upsert. create_profile_on_signup makes the row the moment the
  // auth user exists, so there has never been anything to insert — and the
  // upsert compiled to ON CONFLICT DO UPDATE setting every column it was given,
  // including `id`. Since 20260815000800 took `id` out of the members' update
  // grant, that was a permission error on the first screen of onboarding, and
  // it read as "That didn't save."
  //
  // The grant is right: nobody should be able to write their own primary key.
  // The upsert was papering over a row it already had.
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName, birthdate })
    .eq("id", userId);

  if (error) return { error: "That didn't save. Try again." };

  // Back to the one door, which works out what comes next (§7.2 order) rather
  // than each screen carrying its own copy of the sequence.
  redirect(nextRoute("profile_basics"));
}
