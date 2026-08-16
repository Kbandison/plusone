"use server";

import { revalidatePath } from "next/cache";

import { getServerSupabase } from "@/lib/supabase";
import type { DecisionState, RevealState } from "./state";

/**
 * Both actions go through RPCs that check `is_admin()` themselves and write
 * their own audit entries. Nothing here decides who may act — this is a form
 * handler, and a form handler is not a security boundary.
 */
export async function decideVerification(
  _previous: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const userId = String(formData.get("user_id") ?? "");
  const approve = formData.get("decision") === "approve";
  const note = String(formData.get("note") ?? "").trim() || null;

  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("admin_decide_verification", {
    p_user_id: userId,
    p_approve: approve,
    p_note: note,
  });

  if (error) return { error: error.message, message: null };

  revalidatePath("/admin/verifications");
  return { error: null, message: approve ? "Verified." : "Rejected." };
}

/**
 * §7.3 — condition data is never shown by default, and a reveal requires a
 * reason that is logged. The reason is not validated here: the RPC refuses a
 * short one and writes the audit row in the same statement as the read, so the
 * two cannot come apart. Checking it here as well would only produce a nicer
 * message, and would risk reading like the check.
 */
export async function revealCondition(
  _previous: RevealState,
  formData: FormData,
): Promise<RevealState> {
  const userId = String(formData.get("user_id") ?? "");
  const reason = String(formData.get("reason") ?? "");

  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("admin_reveal_condition", {
    p_user_id: userId,
    p_reason: reason,
  });

  if (error) return { error: error.message, revealed: null };

  const row = Array.isArray(data) ? data[0] : null;
  return { error: null, revealed: row ?? null };
}
