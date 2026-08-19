import Link from "next/link";

import { COPY, DRAFT_COPY } from "@plusone/config";
import { onboarding } from "@plusone/logic";

import { buttonClass } from "@/app/ui";
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
 * The way back, as a control rather than a hint.
 *
 * It was a small grey underlined link, which read as a footnote next to a solid
 * Continue — the two are a pair and one of them looked like a decision while
 * the other looked like a remark. `secondary` is the same shape and height as
 * Continue with an outline instead of a fill: unmistakably the other half of
 * the pair, and unmistakably not the thing to press by default.
 *
 * Still a real link, not history.back(): a member who arrived here from a
 * redirect has a history stack that does not lead where the arrow says.
 */
export function BackLink({ step }: { step: onboarding.OnboardingStep }) {
  const back = onboarding.backStep(step);
  if (!back) return null;

  return (
    <Link
      href={STEP_ROUTES[back]}
      aria-label={DRAFT_COPY.steps.backTo(STEP_HEADINGS[back])}
      className={backButtonClass}
    >
      {DRAFT_COPY.steps.backLabel}
    </Link>
  );
}

/**
 * The row a step ends on: the way back and the way forward, together.
 *
 * Back used to sit above the heading, at the top of the screen, where it was
 * both easy to miss and a long way from the decision it undoes. A member
 * finishing a step is looking at the bottom of the form — so that is where both
 * of their options belong.
 *
 * Back is FIRST, on the left, in the DOM as well as on screen. An earlier
 * version put Continue first so a keyboard would reach the primary action
 * before a way out of the flow; that was the wrong trade. Tab order that
 * disagrees with reading order is its own bug, and back-then-forward is the
 * order every wizard a member has ever used puts them in.
 */
export function StepActions({
  step,
  back,
  children,
}: {
  step: onboarding.OnboardingStep;
  /**
   * A different way back, for a step that has to SAVE before it leaves.
   *
   * A plain link cannot: it never submits, so anything typed since the last
   * Continue is gone. That is invisible on a screen with one field whose saved
   * value comes straight back, and it is twelve questions on the quiz.
   */
  back?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap-reverse items-center gap-x-4 gap-y-3">
      {back ?? <BackLink step={step} />}
      {children}
    </div>
  );
}

/** The Back control's classes, so a step rendering its own still matches. */
export const backButtonClass = buttonClass("secondary", "w-full sm:w-auto sm:min-w-[117px]");
