import { redirect } from "next/navigation";

import { onboarding } from "@plusone/logic";

import { STEP_ROUTES, loadFacts } from "@/lib/onboarding";
import { getServerSupabase } from "@/lib/supabase";

/**
 * Deferred, not resolved.
 *
 * `instant = false` marks this segment as ALLOWED TO BLOCK while Cache
 * Components is adopted one route at a time — the incremental flow the
 * migration guide describes. It does not force the route to be dynamic, so a
 * genuinely prerenderable one still ships a static shell.
 *
 * Removing this line is the unit of work: the route then has to resolve its own
 * validation, by caching data with `use cache` or wrapping the runtime parts in
 * <Suspense>.
 */
export const instant = false;

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
