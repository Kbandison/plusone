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
 *
 * ── WHAT A LAPSE DOES, AND WHY THIS SITE DIFFERS FROM THE FILTERS ───────────
 *
 *     photo overrides (18b)  KEPT on a lapse
 *     incognito (18a)        KEPT on a lapse
 *     paid filters (18d)     DROPPED on a lapse
 *
 * Three sites of one principle, and the paid filters are the odd one out. Read
 * any of them alone and applied to another, two of the three give the wrong
 * answer, and the wrong answers are not equally bad: applying the FILTER rule
 * here would take incognito off somebody whose subscription ended, putting a
 * person who is ill back into a directory they had paid to be absent from, at a
 * moment they were not present and had not agreed to anything.
 *
 * The principle is not "ignore the lapsed state" and not "keep it". It is: the
 * safe direction is whichever one does not increase the member's OWN exposure.
 * Dropping a filter exposes nobody — it shows the viewer more people. Dropping
 * incognito or a photo override exposes the member. One control acts on what a
 * member SEES and the other two on who sees THEM, which is why one rule points
 * two ways.
 *
 * The photo site was written BEFORE this was articulated and obeys it anyway. A
 * rule that predicts a case it was not derived from is a rule; one that only
 * explains the cases it came from is a story told afterwards.
 *
 * **This paragraph lived in 20260829000400 until Kevin ruled that an applied
 * migration is never edited, comments included** — a record you may edit is not
 * a record. It moved here rather than being reverted, because the cross-
 * reference is genuinely needed and this is where somebody changing lapse
 * behaviour actually reads. `incognito.test.ts` pins it, and the enforcement it
 * describes is still in the migration where it always was.
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
