"use server";

import { revalidatePath } from "next/cache";

import { getServerSupabase } from "@/lib/supabase";

export type SettingsState = { readonly error: string | null; readonly message: string | null };
export const SETTINGS_INITIAL: SettingsState = { error: null, message: null };

/**
 * Requesting deletion (§9.3, on the never-cut list).
 *
 * This is a request, not a soft delete: `request_deletion` sets a purge date and
 * the nightly job removes the rows. Nothing here hides the member in the
 * meantime and nothing marks them inactive — the account works normally until
 * it stops existing, because a seven-day limbo where you are invisible but not
 * gone is a worse experience than either.
 *
 * The typed confirmation is not decoration. §3.4's copy says "this cannot be
 * undone — and we mean actually deleted", and a single tap is not consent to
 * something irreversible.
 */
export async function requestDeletion(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") {
    return { error: "Type DELETE to confirm.", message: null };
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("request_deletion");
  if (error) return { error: error.message, message: null };

  const purgeAfter = new Date(data as string);
  revalidatePath("/app/settings");
  return {
    error: null,
    message: `Everything will be gone by ${purgeAfter.toLocaleDateString()}.`,
  };
}

export async function setCrossCommunityOptIn(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const optIn = formData.get("cross_community") === "on";

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("profiles")
    .update({ cross_community_opt_in: optIn })
    .eq("id", auth.user!.id);

  if (error) return { error: "That didn't save.", message: null };
  revalidatePath("/app/settings");
  return { error: null, message: null };
}
