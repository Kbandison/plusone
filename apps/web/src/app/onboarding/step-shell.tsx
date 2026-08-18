import Link from "next/link";

import { COPY, DRAFT_COPY } from "@plusone/config";
import { onboarding } from "@plusone/logic";

import { STEP_ROUTES } from "@/lib/onboarding";

import { signOut } from "@/app/app/settings/sign-out";

/**
 * The frame every onboarding step sits in: where you are, what this screen is
 * for, and nothing else. §7.2 targets under eight minutes, and the surest way to
 * miss that is a screen that looks like it might contain more than it does.
 */
/**
 * The heading each step shows, so a Back link can name where it goes.
 *
 * "Back" on its own is a link a screen reader reads out of context — in a list
 * of links it is indistinguishable from every other one — so the accessible
 * name says the destination. Exhaustive by type: a step added without a heading
 * here stops compiling rather than shipping an unnamed link.
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

export function StepShell({
  step,
  heading,
  intro,
  children,
}: {
  step: onboarding.OnboardingStep;
  heading: string;
  intro?: string;
  children: React.ReactNode;
}) {
  const { current, total } = onboarding.progress({
    step,
    completed: [],
    skipped: [],
    consentGrantedAt: null,
  });

  // Null on the first editable step and on everything before it: phone and
  // liveness are verification, not answers to revise.
  const back = onboarding.backStep(step);

  return (
    <main id="main" className="mx-auto w-full max-w-[600px] px-6 py-16 sm:py-24">
      <p className="text-[13px] tracking-[0.04em] text-ink-3 uppercase">
        Step {current + 1} of {total}
      </p>

      <div
        className="mt-4 h-px w-full bg-line"
        role="progressbar"
        aria-valuenow={current + 1}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label="Onboarding progress"
      >
        <div className="h-px bg-accent" style={{ width: `${((current + 1) / total) * 100}%` }} />
      </div>

      <BackLink step={step} />

      <h1 className={`${back ? "mt-4" : "mt-12"} text-h2 text-balance`}>{heading}</h1>

      {intro ? <p className="mt-6 text-[16.5px] leading-[1.7] text-ink-2">{intro}</p> : null}

      {children}

      {/* A way off the device, on every onboarding screen.
       *
       * Sign-out lived only in Settings, Settings is behind the app shell, and
       * the shell sends anybody whose step is not "done" back into onboarding.
       * So a member who failed the selfie check — or was flagged and handed to a
       * human — could not sign out at all. On an app about a stigmatised
       * condition, on a phone somebody might hand to a friend, that is the one
       * control that has to be reachable from everywhere. */}
      <form action={signOut} className="mt-16 border-t border-line pt-6">
        <button
          type="submit"
          className="ease-brand text-[14px] text-ink-3 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
        >
          {DRAFT_COPY.app.signOutLabel}
        </button>
      </form>
    </main>
  );
}

/**
 * The way back, for any onboarding screen.
 *
 * Exported because /onboarding/consent builds its own frame rather than using
 * this shell — §9.1 wants that paragraph rendered verbatim in a particular
 * order — and a Back control that appeared on eight steps and vanished on the
 * ninth would read as a dead end on exactly the screen where members are most
 * careful.
 *
 * A real link, not history.back(): a member who arrived here from a redirect
 * has a history stack that does not lead where the arrow says it does.
 */
export function BackLink({ step }: { step: onboarding.OnboardingStep }) {
  const back = onboarding.backStep(step);
  if (!back) return null;

  return (
    <p className="mt-10">
      <Link
        href={STEP_ROUTES[back]}
        // "Back" alone is a link a screen reader reads out of context, where it
        // is indistinguishable from every other one. This names the destination.
        aria-label={DRAFT_COPY.steps.backTo(STEP_HEADINGS[back])}
        className="ease-brand inline-flex min-h-tap items-center gap-1.5 text-[14.5px] text-ink-3 transition-colors duration-200 hover:text-ink"
      >
        <span aria-hidden="true">&larr;</span>
        {DRAFT_COPY.steps.backLabel}
      </Link>
    </p>
  );
}
