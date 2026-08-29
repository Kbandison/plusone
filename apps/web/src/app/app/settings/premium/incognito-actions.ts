"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";

export interface IncognitoState {
  error: string | null;
  on?: boolean;
}

/**
 * Turning incognito on and off (server 18a).
 *
 * This action is NOT the gate and must not be mistaken for it. `profiles` has
 * no `update (incognito)` grant at all, so the only way the column moves is
 * `set_incognito()`, which is SECURITY DEFINER and checks `is_premium()`
 * itself. Deleting every line of premium logic from this file would change
 * nothing about who can go incognito — which is the property worth having,
 * because a server action is one path to a row and PostgREST is another.
 *
 * The RPC refuses with insufficient_privilege (42501) rather than returning
 * false, so a member whose premium lapsed between the page rendering and the
 * toggle being pressed gets a sentence rather than a silent no-op.
 */
export async function setIncognito(
  _previous: IncognitoState,
  formData: FormData,
): Promise<IncognitoState> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const on = formData.get("on") === "1";

  const { error } = await supabase.rpc("set_incognito", { p_on: on });
  if (error) {
    return {
      error:
        error.code === "42501"
          ? DRAFT_COPY.app.incognitoNeedsPremium
          : DRAFT_COPY.app.incognitoFailed,
    };
  }

  // Every dating surface reads visible_profiles, so a cached render of any of
  // them is a render made under the old visibility.
  revalidatePath("/app/settings/premium");
  revalidatePath("/app/browse");
  revalidatePath("/app");
  return { error: null, on };
}
