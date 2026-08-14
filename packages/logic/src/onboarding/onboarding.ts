import {
  FINAL_STEP,
  ONBOARDING_STEPS,
  SKIPPABLE_STEPS,
  type OnboardingErrorCode,
  type OnboardingFacts,
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

/** Which fact settles each step. `done` has none — it is the absence of gaps. */
const SETTLED_BY: Record<Exclude<OnboardingStep, "done">, (f: OnboardingFacts) => boolean> = {
  phone: (f) => f.phoneVerified,
  liveness: (f) => f.livenessPassed,
  profile_basics: (f) => f.hasBasics,
  community_condition: (f) => f.hasCommunity,
  health_consent: (f) => f.hasHealthConsent,
  intention: (f) => f.hasIntention,
  quiz: (f) => f.quizSettled,
  photos: (f) => f.hasPhoto,
  radius: (f) => f.radiusSet,
};

/**
 * Where a member belongs right now, given what the database knows.
 *
 * This is what makes onboarding resumable: someone who closes the app at the
 * photos step and comes back three days later lands on photos, not at the
 * beginning. §7.2 targets under eight minutes, and re-answering four screens
 * because you took a phone call is how that target gets missed.
 *
 * It returns the FIRST unsettled step in §7.2 order, never the furthest one
 * reached. That ordering is what makes consent a gate rather than a checkpoint:
 * if a consent is missing — because the wording changed and the old tick no
 * longer counts — a member goes back to it even though every later step is
 * already answered.
 */
export function resolveStep(facts: OnboardingFacts): OnboardingStep {
  for (const step of ONBOARDING_STEPS) {
    if (step === FINAL_STEP) break;
    if (!SETTLED_BY[step](facts)) return step;
  }
  return FINAL_STEP;
}

/** Every step still unsettled, in order. For a "what's left" summary. */
export function unsettledSteps(facts: OnboardingFacts): readonly OnboardingStep[] {
  return ONBOARDING_STEPS.filter(
    (step) => step !== FINAL_STEP && !SETTLED_BY[step](facts),
  );
}
