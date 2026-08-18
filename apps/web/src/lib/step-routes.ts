import { onboarding } from "@plusone/logic";

type Step = onboarding.OnboardingStep;

/**
 * Where each §7.2 step lives.
 *
 * Its OWN module, deliberately, and nothing here may import a server API. This
 * map is a constant, but it used to sit in lib/onboarding beside requireStep —
 * which imports `next/headers` — so the moment a Client Component needed a step
 * URL for a link, the whole server module came with it and the build failed on
 * `cookies()` reaching the browser. Typecheck was perfectly happy; only
 * `next build` knew.
 *
 * Exhaustive by type: adding a step to the machine without giving it a route
 * stops compiling, rather than routing someone to a 404 halfway through signing
 * up.
 */
export const STEP_ROUTES: Record<Step, string> = {
  phone: "/onboarding/phone",
  liveness: "/onboarding/liveness",
  profile_basics: "/onboarding/basics",
  community_condition: "/onboarding/community",
  health_consent: "/onboarding/consent",
  intention: "/onboarding/intention",
  preferences: "/onboarding/preferences",
  quiz: "/onboarding/quiz",
  photos: "/onboarding/photos",
  radius: "/onboarding/radius",
  done: "/app",
};

/**
 * Where Continue goes: the NEXT step, not the first unfinished one.
 *
 * Every action used to redirect to /onboarding, which resolves to the first
 * step the member has not settled. That is right for arriving at onboarding and
 * wrong for finishing a step: a member who walked back to correct their name
 * pressed Continue and was thrown to the far end of the flow, past every screen
 * they had already done and out of reach of the ones in between.
 */
export function nextRoute(step: Step): string {
  return STEP_ROUTES[onboarding.nextStep(step)];
}
