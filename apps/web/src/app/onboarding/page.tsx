import { redirect } from "next/navigation";

import { onboarding } from "@plusone/logic";

import { STEP_ROUTES, loadFacts } from "@/lib/onboarding";
import { getServerSupabase } from "@/lib/supabase";

/**
 * The onboarding entry. It renders nothing — it works out where the member
 * belongs and sends them there.
 *
 * Having one door means a member who closes the app halfway and comes back to
 * the bare link lands on the step they stopped at, and every screen can finish
 * by returning here rather than hard-coding what comes next.
 */
export default async function OnboardingEntry() {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();

  if (!data.user) redirect(STEP_ROUTES.phone);

  redirect(STEP_ROUTES[onboarding.resolveStep(await loadFacts(data.user.id))]);
}
