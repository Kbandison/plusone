import { onboarding } from "@plusone/logic";

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

      <h1 className="mt-12 text-[clamp(2rem,6vw,2.6rem)] text-balance">{heading}</h1>

      {intro ? <p className="mt-6 text-[16.5px] leading-[1.7] text-ink-2">{intro}</p> : null}

      {children}
    </main>
  );
}
