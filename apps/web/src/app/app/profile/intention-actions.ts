"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DRAFT_COPY, INTENTION_LABELS, type Intention } from "@plusone/config";

import { memberFacingError } from "@/lib/rpc-error";
import { getServerSupabase } from "@/lib/supabase";
import { NAME_INITIAL, type NameState } from "./name-state";

const VALID = Object.keys(INTENTION_LABELS) as Intention[];

/**
 * Changing what you are here for, from the profile.
 *
 * Onboarding's saveIntention calls requireStep and ends in a redirect to the
 * next step, neither of which belongs on a settings screen. What both share is
 * change_intention: the intention columns are not in the members' update grant
 * (20260815000800), so the RPC is the only way to write one — and it is the
 * RPC, not this action, that holds the thirty-day lock. The disabled control on
 * the page is a courtesy; this is the rule.
 */
export async function changeIntentionSetting(
  _previous: NameState,
  formData: FormData,
): Promise<NameState> {
  const intention = String(formData.get("intention") ?? "");
  if (!VALID.includes(intention as Intention)) {
    return { error: DRAFT_COPY.intention.errors.required, message: null };
  }

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const { error } = await supabase.rpc("change_intention", { p_intention: intention });

  // The cooldown raises P0001 with the date in the message, and that date is
  // the only useful thing this screen can say — flattening it into "that didn't
  // save" would leave a member pressing a button that will not work for another
  // three weeks. It goes through memberFacingError rather than straight out:
  // the same function is what keeps "target is not visible to initiator" from
  // ever reaching a screen, and one action that skips it is the hole.
  if (error)
    return { error: memberFacingError(error, "That didn't save. Try again."), message: null };

  // The Drop and Browse both filter on it.
  for (const path of ["/app", "/app/browse", "/app/profile"]) revalidatePath(path);
  return { ...NAME_INITIAL, message: DRAFT_COPY.app.settingSaved };
}
