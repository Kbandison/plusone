"use server";

import { redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";
import { profile } from "@plusone/logic";

import { requireStep } from "@/lib/onboarding";
import { getServerSupabase } from "@/lib/supabase";
import type { BasicsState } from "./state";

const E = DRAFT_COPY.basics.errors;
const MAX_NAME = 40;

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
  if (displayName.length > MAX_NAME) return { error: E.nameTooLong };
  if (!birthdate) return { error: E.birthdateRequired };

  const today = new Date().toISOString().slice(0, 10);
  if (profile.parseIsoDate(birthdate) === null) return { error: E.birthdateInvalid };
  if (!profile.isAdult(birthdate, today)) return { error: E.tooYoung };

  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, display_name: displayName, birthdate }, { onConflict: "id" });

  if (error) return { error: "That didn't save. Try again." };

  // Back to the one door, which works out what comes next (§7.2 order) rather
  // than each screen carrying its own copy of the sequence.
  redirect("/onboarding");
}
