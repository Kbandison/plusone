import "server-only";

import { getServerSupabase } from "./supabase";

/**
 * The member's own row, for pre-filling a step they have walked back into.
 *
 * Every onboarding form rendered blank on a revisit. That was harmless while
 * there was no way back; the moment Back existed it became destructive — the
 * empty form is a real form, and submitting it writes the emptiness over
 * whatever was there. A member correcting a typo in their name would have had
 * to retype their birthdate, and a member who just looked would have wiped it.
 *
 * my_profile() rather than the table: birthdate is not in the members' column
 * grant (20260815000800), because a table-wide grant was handing every member
 * in your pool an exact date of birth. This is the one row you are allowed all
 * of — your own.
 */
export interface OwnProfileRow {
  display_name: string | null;
  birthdate: string | null;
  community: string | null;
  condition: string | null;
  u_equals_u: boolean | null;
  cross_community_opt_in: boolean | null;
  intention: string | null;
  search_radius_mi: number | null;
  photo_privacy: string | null;
  gender: string | null;
  seeking: string[] | null;
  age_min: number | null;
  age_max: number | null;
  smokes: string | null;
  drinks: string | null;
  kids: string | null;
  kids_plan: string | null;
}

export async function ownProfile(): Promise<OwnProfileRow | null> {
  const supabase = await getServerSupabase();
  const { data } = await supabase.rpc("my_profile").maybeSingle<OwnProfileRow>();
  return data ?? null;
}

/** The answers a member already gave the quiz, keyed by question id. */
export async function ownQuizAnswers(userId: string): Promise<Record<string, string>> {
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("quiz_responses")
    .select("answers")
    .eq("user_id", userId)
    .maybeSingle();

  const answers = (data?.answers ?? null) as unknown;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return {};
  return Object.fromEntries(
    Object.entries(answers as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}
