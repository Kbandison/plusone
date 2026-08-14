import {
  FINAL_STEP,
  ONBOARDING_STEPS,
  SKIPPABLE_STEPS,
  type OnboardingErrorCode,
  type OnboardingEvent,
  type OnboardingResult,
  type OnboardingState,
  type OnboardingStep,
} from "./types";

export const INITIAL_ONBOARDING_STATE: OnboardingState = {
  step: "phone",
  completed: [],
  skipped: [],
  consentGrantedAt: null,
};

const ok = (state: OnboardingState): OnboardingResult => ({ ok: true, state });
const fail = (code: OnboardingErrorCode): OnboardingResult => ({ ok: false, code });

export function stepIndex(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step);
}

export function isSkippable(step: OnboardingStep): boolean {
  return (SKIPPABLE_STEPS as readonly OnboardingStep[]).includes(step);
}

export function isFinished(state: OnboardingState): boolean {
  return state.step === FINAL_STEP;
}

/** The step after `step`, or `done` at the end. */
function nextStep(step: OnboardingStep): OnboardingStep {
  const next = ONBOARDING_STEPS[stepIndex(step) + 1];
  return next ?? FINAL_STEP;
}

/** Advances past the current step, recording it as completed or skipped. */
function advance(
  state: OnboardingState,
  outcome: "completed" | "skipped",
): OnboardingState {
  const current = state.step;
  const already = state[outcome].includes(current);
  return {
    ...state,
    step: nextStep(current),
    [outcome]: already ? state[outcome] : [...state[outcome], current],
  };
}

/**
 * The onboarding flow as one pure reducer. No clock, no I/O — every timestamp
 * arrives on the event.
 */
export function transition(state: OnboardingState, event: OnboardingEvent): OnboardingResult {
  if (isFinished(state) && event.type !== "go_back") return fail("already_finished");

  switch (event.type) {
    case "complete": {
      // §9.1 wants an explicit, unbundled tick. A generic "next" is exactly the
      // bundled consent the requirement exists to prevent, so it cannot pass
      // this step — not even when consent was somehow granted already.
      if (state.step === "health_consent") return fail("consent_required");
      return ok(advance(state, "completed"));
    }

    case "skip": {
      if (!isSkippable(state.step)) return fail("step_not_skippable");
      return ok(advance(state, "skipped"));
    }

    case "grant_consent": {
      // Consent cannot be pre-ticked on an earlier screen — that is the other
      // half of "unbundled".
      if (state.step !== "health_consent") return fail("not_on_consent_step");
      if (state.consentGrantedAt !== null) return fail("consent_already_granted");
      return ok({
        ...advance(state, "completed"),
        consentGrantedAt: event.at,
      });
    }

    case "go_back": {
      const previous = ONBOARDING_STEPS[stepIndex(state.step) - 1];
      if (previous === undefined) return fail("nothing_to_go_back_to");
      return ok({ ...state, step: previous });
    }
  }
}

/**
 * Progress for the UI. `done` is a destination rather than a task, so it is not
 * counted — a member on the last real step should read as nearly finished, not
 * as having one more thing to do.
 */
export function progress(state: OnboardingState): {
  readonly current: number;
  readonly total: number;
  readonly fraction: number;
} {
  const total = ONBOARDING_STEPS.length - 1;
  const current = Math.min(stepIndex(state.step), total);
  return { current, total, fraction: current / total };
}

/** Whether the member gave the §9.1 health-data consent. */
export function hasHealthConsent(state: OnboardingState): boolean {
  return state.consentGrantedAt !== null;
}

/**
 * Steps still standing between the member and the end. Skipped steps do not
 * come back — the quiz nudges once and then stays out of the way.
 */
export function remainingSteps(state: OnboardingState): readonly OnboardingStep[] {
  return ONBOARDING_STEPS.slice(stepIndex(state.step), ONBOARDING_STEPS.length - 1);
}
