"use server";

import { redirect } from "next/navigation";

import { DRAFT_COPY, INTENTION_LABELS, type Intention } from "@plusone/config";

import { requireStep } from "@/lib/onboarding";
import { getServerSupabase } from "@/lib/supabase";

export type IntentionState = { readonly error: string | null };

const VALID = Object.keys(INTENTION_LABELS) as Intention[];

export async function saveIntention(
  _previous: IntentionState,
  formData: FormData,
): Promise<IntentionState> {
  const { userId } = await requireStep("intention");

  const intention = String(formData.get("intention") ?? "");
  if (!VALID.includes(intention as Intention)) {
    return { error: DRAFT_COPY.intention.errors.required };
  }

  const supabase = await getServerSupabase();
  // intention_changed_at starts the 30-day lock (§6, COOLDOWNS). Set on the
  // first choice too, so the clock is the same one for everybody rather than
  // starting at whatever moment a member first edits it.
  const { error } = await supabase
    .from("profiles")
    .update({ intention, intention_changed_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) return { error: "That didn't save. Try again." };

  redirect("/onboarding");
}
