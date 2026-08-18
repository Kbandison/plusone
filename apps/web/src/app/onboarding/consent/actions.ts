"use server";

import { redirect } from "next/navigation";

import { CONSENT_COPY_VERSION } from "@plusone/config";

import { nextRoute, requireStep } from "@/lib/onboarding";
import { getServerSupabase } from "@/lib/supabase";
import type { ConsentActionState } from "./state";

/**
 * Records the §9.1 health-data consent.
 *
 * Three things this deliberately does NOT do:
 *
 *   · trust the client's word that the box was ticked — the checkbox is
 *     re-checked here, because a consent recorded from an untrusted assertion
 *     is not a consent;
 *   · use the service client — this runs as the member, so the RLS policy on
 *     `consents` is what authorises the write, not this function;
 *   · record a bare timestamp — `copy_version` ties the tick to the exact
 *     wording the member read.
 */
export async function grantHealthDataConsent(
  _previous: ConsentActionState,
  formData: FormData,
): Promise<ConsentActionState> {
  if (formData.get("agree") !== "on") {
    return { error: "Tick the box to continue." };
  }

  // Also the guard: this cannot be POSTed out of order, so consent can never be
  // recorded for a member who has not reached the screen.
  const { userId } = await requireStep("health_consent");
  const supabase = await getServerSupabase();

  const { error } = await supabase.from("consents").insert({
    user_id: userId,
    kind: "health_data",
    copy_version: CONSENT_COPY_VERSION.health_data,
  });

  // The table is unique on (user_id, kind, copy_version). Re-submitting the
  // same consent is a duplicate, not a failure — a member who double-taps
  // should move forward, not see an error.
  if (error && error.code !== "23505") {
    return { error: "That didn't save. Try again." };
  }

  // Back to the one door. Each screen knowing only "I am finished" keeps the
  // §7.2 order in a single place.
  redirect(nextRoute("health_consent"));
}
