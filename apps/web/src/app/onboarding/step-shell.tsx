import { DRAFT_COPY } from "@plusone/config";
import { onboarding } from "@plusone/logic";

import { signOut } from "@/app/app/settings/sign-out";

/**
 * The frame every onboarding step sits in: where you are, what this screen is
 * for, and nothing else. §7.2 targets under eight minutes, and the surest way to
 * miss that is a screen that looks like it might contain more than it does.
 */
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

  return (
    <main id="main" className="mx-auto w-full max-w-[540px] px-6 py-16 sm:py-24">
      <p className="text-[12.2px] tracking-[0.04em] text-ink-3 uppercase">
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

      <h1 className="mt-12 text-h2 text-balance">{heading}</h1>

      {intro ? <p className="mt-6 text-[14.9px] leading-[1.7] text-ink-2">{intro}</p> : null}

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
          className="ease-brand text-[12.6px] text-ink-3 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
        >
          {DRAFT_COPY.app.signOutLabel}
        </button>
      </form>
    </main>
  );
}
