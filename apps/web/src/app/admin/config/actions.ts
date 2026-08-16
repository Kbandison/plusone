"use server";

import { revalidatePath } from "next/cache";

import { getServerSupabase } from "@/lib/supabase";
import type { ConfigState } from "./state";

/**
 * Changing a tunable.
 *
 * `admin_set_config` checks is_admin(), refuses unknown keys, and audits the
 * change with its OLD value. Nothing is validated here beyond the value being a
 * number — the range checks belong to whatever reads the key, and duplicating
 * them in a form is how a screen ends up disagreeing with the thing it edits.
 */
export async function setConfig(_previous: ConfigState, formData: FormData): Promise<ConfigState> {
  const key = String(formData.get("key") ?? "");
  const raw = String(formData.get("value") ?? "").trim();
  const value = Number(raw);

  if (!Number.isFinite(value)) return { error: "That needs to be a number.", message: null };

  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("admin_set_config", {
    p_key: key,
    p_value: value,
  });

  if (error) return { error: error.message, message: null };

  revalidatePath("/admin/config");
  return { error: null, message: `${key} saved.` };
}
