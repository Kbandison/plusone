"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getServerSupabase } from "@/lib/supabase";
import { TRIAGE_INITIAL, type TriageState } from "./state";

/**
 * Triage.
 *
 * Unlike the waitlist admin — which had to check `is_admin()` itself, because
 * the service client bypasses RLS and there was no wall behind it — this one
 * goes through an RPC that refuses a non-admin at the table. So the wall is
 * where the write is, which is the pattern every other admin action here uses,
 * and the check below is the layout's guard rather than the only one.
 */
export async function setStatus(_previous: TriageState, formData: FormData): Promise<TriageState> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const { error } = await supabase.rpc("admin_set_feedback_status", {
    p_id: String(formData.get("id") ?? ""),
    p_status: String(formData.get("status") ?? ""),
    p_note: String(formData.get("note") ?? "") || null,
  });

  if (error) return { error: "That didn't save.", message: null };

  revalidatePath("/admin/feedback");
  return { ...TRIAGE_INITIAL, message: "Saved." };
}
