"use server";

import { revalidatePath } from "next/cache";

import { getServerSupabase } from "@/lib/supabase";

export type ModeState = { readonly error: string | null; readonly message: string | null };
export const MODE_INITIAL: ModeState = { error: null, message: null };

/**
 * The mode toggle (§6.4, Decision #20).
 *
 * `switch_mode` is the authority: it holds the re-entry cooldown and it runs as
 * the member. `packages/logic/modes` states the same rule where a screen can
 * grey out a control and say when it lifts, but this action does not re-check
 * it — one enforcement point, and it is the one nothing can route around.
 *
 * Leaving dating is never refused. If this ever returns an error for a switch
 * to support_only, something has gone wrong in the database, not in the member's
 * entitlement to leave.
 */
export async function switchMode(_previous: ModeState, formData: FormData): Promise<ModeState> {
  const target = formData.get("mode") === "support_only" ? "support_only" : "dating";

  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("switch_mode", { p_mode: target });

  if (error) return { error: error.message, message: null };

  revalidatePath("/app/profile");
  revalidatePath("/app");
  return {
    error: null,
    message: target === "support_only" ? "You're in support-only mode." : "You're back in dating.",
  };
}
