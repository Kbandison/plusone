"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";

export interface ReadReceiptsState {
  error: string | null;
  hidden?: boolean;
}

/**
 * Hiding and un-hiding your read receipts.
 *
 * Like `setIncognito`, this action is NOT the gate. `profiles` has no
 * `update (hide_read_receipts)` grant, so the only thing that moves the column
 * is `set_read_receipts_hidden()`, which is SECURITY DEFINER and checks
 * `is_premium()` itself. Deleting the premium handling from this file would
 * change nothing about who can hide — a server action is one path to a row and
 * PostgREST is another.
 *
 * ── the default is ON, and that is the feature ──────────────────────────────
 *
 * Receipts show for everybody unless they pay to stop them. That is the
 * opposite of how a privacy control normally arrives here, and it is deliberate:
 * "nobody gets ghosted" is the brand line, so the transparent state is the one
 * the product ships. Premium buys stepping out of it.
 *
 * Checked against PREMIUM_NEVER before building, because "exemptions from
 * closure notes" is on it and this looks adjacent. It is not an exemption:
 * hiding a receipt leaves the seven-day fuse and the closure note exactly where
 * they were, so a member who hides still owes the same accounting for how a
 * conversation ended. If a future change makes receipts load-bearing for either,
 * this stops being sellable.
 *
 * ── the lapse ───────────────────────────────────────────────────────────────
 *
 *     photo overrides (18b)   KEPT on a lapse
 *     incognito (18a)         KEPT on a lapse
 *     read receipts (here)    KEPT on a lapse
 *     paid filters (18d)      DROPPED on a lapse
 *
 * The rule `incognito-actions.ts` states is that the safe direction is whichever
 * does not increase the member's OWN exposure — and this is a fourth site of it,
 * decided by that rule rather than by fresh judgement. Un-hiding somebody's
 * receipts because their card expired would start telling people when they read
 * their messages, at a moment they were not present and agreed to nothing.
 *
 * Which is why turning it OFF is never gated, in the function as well as here:
 * a lapsed member who could not clear their own flag would be stranded holding a
 * setting they can neither keep deliberately nor undo.
 */
export async function setReadReceiptsHidden(
  _previous: ReadReceiptsState,
  formData: FormData,
): Promise<ReadReceiptsState> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const hidden = formData.get("hidden") === "1";

  const { error } = await supabase.rpc("set_read_receipts_hidden", { p_hidden: hidden });
  if (error) {
    return {
      error:
        error.code === "42501"
          ? DRAFT_COPY.app.readReceiptsNeedsPremium
          : DRAFT_COPY.app.readReceiptsFailed,
    };
  }

  // The receipt is read on the chat screen, so a cached render of one is a
  // render made under the old setting.
  revalidatePath("/app/settings/premium");
  revalidatePath("/app/inbox");
  return { error: null, hidden };
}
