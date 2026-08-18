import Link from "next/link";

import { COPY, DRAFT_COPY } from "@plusone/config";
import { onboarding } from "@plusone/logic";

import { STEP_ROUTES } from "@/lib/step-routes";

/**
 * The heading each step shows, so a Back link can name where it goes.
 *
 * "Back" on its own is a link a screen reader reads out of context, where it is
 * indistinguishable from every other one. Exhaustive by type: a step added
 * without a heading here stops compiling rather than shipping an unnamed link.
 */
const STEP_HEADINGS: Record<Exclude<onboarding.OnboardingStep, "done">, string> = {
  phone: DRAFT_COPY.phone.heading,
  liveness: DRAFT_COPY.liveness.heading,
  profile_basics: DRAFT_COPY.basics.heading,
  community_condition: DRAFT_COPY.community.heading,
  health_consent: COPY.consent.heading,
  intention: DRAFT_COPY.intention.heading,
  preferences: DRAFT_COPY.preferences.heading,
  quiz: DRAFT_COPY.quiz.heading,
  photos: DRAFT_COPY.photos.heading,
  radius: DRAFT_COPY.radius.heading,
};

/**
 * The way back.
 *
 * A real link, not history.back(): a member who arrived here from a redirect has
 * a history stack that does not lead where the arrow says it does.
 */
export function BackLink({ step }: { step: onboarding.OnboardingStep }) {
  const back = onboarding.backStep(step);
  if (!back) return null;

  return (
    <Link
      href={STEP_ROUTES[back]}
      aria-label={DRAFT_COPY.steps.backTo(STEP_HEADINGS[back])}
      className="ease-brand inline-flex min-h-tap items-center gap-1.5 text-[14.5px] text-ink-3 transition-colors duration-200 hover:text-ink"
    >
      <span aria-hidden="true">&larr;</span>
      {DRAFT_COPY.steps.backLabel}
    </Link>
  );
}

/**
 * The row a step ends on: the way forward and the way back, together.
 *
 * Back used to sit above the heading, at the top of the screen, where it was
 * both easy to miss and a long way from the decision it undoes. A member
 * finishing a step is looking at the bottom of the form — so that is where both
 * of their options belong.
 *
 * Forward first in the DOM as well as on screen. It is the primary action, it
 * is what most members want, and putting it first means a keyboard reaches it
 * first rather than tabbing past a way out of the flow to get to it.
 */
export function StepActions({
  step,
  children,
}: {
  step: onboarding.OnboardingStep;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
      {children}
      <BackLink step={step} />
    </div>
  );
}
