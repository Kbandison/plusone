"use server";

import { redirect } from "next/navigation";

import {
  DRAFT_COPY,
  allowsUEqualsU,
  isValidPair,
  type Community,
  type ConditionDetail,
} from "@plusone/config";

import { requireStep } from "@/lib/onboarding";
import { getServerSupabase } from "@/lib/supabase";
import type { CommunityState } from "./state";

const E = DRAFT_COPY.community.errors;

const COMMUNITIES: readonly string[] = ["hsv", "hiv"];

export async function saveCommunity(
  _previous: CommunityState,
  formData: FormData,
): Promise<CommunityState> {
  const { userId } = await requireStep("community_condition");

  const community = String(formData.get("community") ?? "");
  const condition = String(formData.get("condition") ?? "");

  if (!COMMUNITIES.includes(community)) return { error: E.communityRequired };
  if (!condition) return { error: E.conditionRequired };

  // The pair is re-checked here rather than trusted from the form. The database
  // would refuse a mismatch anyway (profiles_condition_matches_community), but
  // a member deserves a sentence rather than a failed insert — and the select
  // that constrains the options lives in a client component, which is not a
  // place to enforce anything.
  if (!isValidPair(community as Community, condition as ConditionDetail)) {
    return { error: E.mismatch };
  }

  // §5.2 — the badge is only meaningful for HIV, and the SQL enforces it. A
  // form that was tampered with does not get to set it on an HSV profile.
  const uEqualsU = allowsUEqualsU(community as Community) && formData.get("u_equals_u") === "on";

  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("profiles")
    .update({ community, condition, u_equals_u: uEqualsU })
    .eq("id", userId);

  if (error) return { error: "That didn't save. Try again." };

  redirect("/onboarding");
}
