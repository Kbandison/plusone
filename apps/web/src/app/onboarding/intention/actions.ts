"use server";

import { redirect } from "next/navigation";

import { DRAFT_COPY, INTENTION_LABELS, type Intention } from "@plusone/config";

import { requireStep } from "@/lib/onboarding";
import { getServerSupabase } from "@/lib/supabase";
import type { IntentionState } from "./state";

const VALID = Object.keys(INTENTION_LABELS) as Intention[];

export async function saveIntention(
  _previous: IntentionState,
  formData: FormData,
): Promise<IntentionState> {
  await requireStep("intention");

  const intention = String(formData.get("intention") ?? "");
  if (!VALID.includes(intention as Intention)) {
    return { error: DRAFT_COPY.intention.errors.required };
  }

  const supabase = await getServerSupabase();
  // change_intention, not a column write. It sets intention_changed_at in the
  // same statement, which starts the 30-day lock (§6, COOLDOWNS) — on the first
  // choice too, so the clock is the same one for everybody rather than starting
  // at whatever moment a member first edits it.
  //
  // Going through the RPC is what makes the cooldown real: the columns are no
  // longer in the members' update grant (20260815000800), so this is now the
  // only way to change an intention rather than the polite way.
  const { error } = await supabase.rpc("change_intention", {
    p_intention: intention,
  });

  if (error) return { error: "That didn't save. Try again." };

  redirect("/onboarding");
}
