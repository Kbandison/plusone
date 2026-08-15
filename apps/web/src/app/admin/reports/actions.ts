"use server";

import { revalidatePath } from "next/cache";

import { getServerSupabase } from "@/lib/supabase";

export type ReportDecisionState = { readonly error: string | null; readonly message: string | null };
export const REPORT_DECISION_INITIAL: ReportDecisionState = { error: null, message: null };

/**
 * Deciding a report.
 *
 * `admin_resolve_report` checks is_admin() itself, accepts only `resolved` or
 * `dismissed`, refuses a report that is already decided, and audits the
 * decision with the moderator's note in the same call. Nothing here decides
 * anything — this is a form handler.
 */
export async function decideReport(
  _previous: ReportDecisionState,
  formData: FormData,
): Promise<ReportDecisionState> {
  const status = formData.get("status") === "dismissed" ? "dismissed" : "resolved";
  const note = String(formData.get("note") ?? "").trim() || null;

  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("admin_resolve_report", {
    p_queue_id: String(formData.get("queue_id") ?? ""),
    p_status: status,
    p_note: note,
  });

  if (error) return { error: error.message, message: null };

  revalidatePath("/admin/reports");
  return { error: null, message: status === "resolved" ? "Resolved." : "Dismissed." };
}
