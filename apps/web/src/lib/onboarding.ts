import { redirect } from "next/navigation";

import { CONSENT_COPY_VERSION, QUIZ_QUESTIONS } from "@plusone/config";
import { onboarding } from "@plusone/logic";

import { getServerSupabase } from "./supabase";

type Step = onboarding.OnboardingStep;

/**
 * Where each §7.2 step lives. Exhaustive by type: adding a step to the machine
 * without giving it a route stops compiling, rather than routing someone to a
 * 404 halfway through signing up.
 */
export const STEP_ROUTES: Record<Step, string> = {
  phone: "/onboarding/phone",
  liveness: "/onboarding/liveness",
  profile_basics: "/onboarding/basics",
  community_condition: "/onboarding/community",
  health_consent: "/onboarding/consent",
  intention: "/onboarding/intention",
  quiz: "/onboarding/quiz",
  photos: "/onboarding/photos",
  radius: "/onboarding/radius",
  done: "/app",
};

/**
 * Reads the member's progress from the database.
 *
 * The mapping from row to booleans lives here rather than in `packages/logic`,
 * which stays free of database shapes. Everything is read as the member, so RLS
 * is what makes this their own row and not someone else's.
 */
export async function loadFacts(userId: string): Promise<onboarding.OnboardingFacts> {
  const supabase = await getServerSupabase();

  const [{ data: user }, { data: profile }, { data: consent }, { data: photos }, { data: quiz }] =
    await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("profiles")
        .select("display_name, birthdate, community, condition, intention, search_radius_mi, verification_status")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("consents")
        .select("id")
        .eq("user_id", userId)
        .eq("kind", "health_data")
        // Tied to the wording, not just the kind: when the copy changes, the old
        // tick stops counting and the resolver sends them back to consent.
        .eq("copy_version", CONSENT_COPY_VERSION.health_data)
        .maybeSingle(),
      supabase.from("profile_photos").select("id").eq("user_id", userId).limit(1),
      supabase.from("quiz_responses").select("user_id").eq("user_id", userId).maybeSingle(),
    ]);

  return {
    phoneVerified: Boolean(user.user?.phone_confirmed_at),
    livenessPassed: profile?.verification_status === "verified",
    hasBasics: Boolean(profile?.display_name && profile.birthdate),
    hasCommunity: Boolean(profile?.community && profile.condition),
    hasHealthConsent: Boolean(consent),
    hasIntention: Boolean(profile?.intention),
    // §7.2 asks for 10-12 questions and never writes them, and §10 says to ship
    // with intention-weighting only. With no questions there is nothing to
    // answer, so the step does not stall onboarding — and it turns itself on
    // the moment a question is added to QUIZ_QUESTIONS. A skip is recorded as
    // an empty answer set rather than an absence, so skipping does not loop.
    quizSettled: QUIZ_QUESTIONS.length === 0 || Boolean(quiz),
    hasPhoto: Boolean(photos && photos.length > 0),
    radiusSet: Boolean(profile?.search_radius_mi),
  };
}

/**
 * The guard every onboarding screen calls first.
 *
 * Typing a URL cannot skip a step. Without this, `/onboarding/intention` is
 * reachable by anyone who guesses it — which would walk straight past the §9.1
 * consent screen, and a consent you can navigate around is not a consent.
 *
 * Redirects to whichever step the member actually belongs on, which is also
 * what makes the flow resumable.
 */
export async function requireStep(step: Step): Promise<{ userId: string }> {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();

  if (!data.user) redirect(STEP_ROUTES.phone);

  const facts = await loadFacts(data.user.id);
  const actual = onboarding.resolveStep(facts);

  if (actual !== step) redirect(STEP_ROUTES[actual]);

  return { userId: data.user.id };
}
