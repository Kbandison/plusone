import {
  FINAL_STEP,
  FIRST_EDITABLE_STEP,
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

/**
 * The step after `step`, or `done` at the end.
 *
 * Exported because "where does Continue go" and "where does the reducer go" are
 * the same question, and answering it twice is how they drift. Every step used
 * to send the member to /onboarding, which resolves to the first UNSETTLED
 * step — so walking back to step 3 and pressing Continue jumped straight over
 * every completed step to the end, and the way back into them was gone again.
 */
export function nextStep(step: OnboardingStep): OnboardingStep {
  const next = ONBOARDING_STEPS[stepIndex(step) + 1];
  return next ?? FINAL_STEP;
}

/** Advances past the current step, recording it as completed or skipped. */
function advance(state: OnboardingState, outcome: "completed" | "skipped"): OnboardingState {
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
      // §9.1 wants an explicit, unbundled tick, so a generic "next" cannot pass
      // this step — that is exactly the bundled consent the requirement exists
      // to prevent.
      //
      // It can pass a step whose tick has ALREADY happened, though, and it has
      // to. Refusing unconditionally made health_consent a trap with no exit: a
      // member who granted consent and then walked back two steps arrived at it
      // again with consentGrantedAt set, where `complete` failed
      // consent_required, `grant_consent` failed consent_already_granted, and
      // `skip` failed step_not_skippable. Only go_back worked, and walking
      // forward re-entered it. Onboarding could never finish.
      if (state.step === "health_consent" && state.consentGrantedAt === null) {
        return fail("consent_required");
      }
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
 * The step a Back control should return to, or null when there is none.
 *
 * Not simply `ONBOARDING_STEPS[i - 1]`. The first two steps are verification,
 * not profile data: `phone` owns a number that has already been confirmed by
 * SMS and `liveness` owns a check that has already passed, and neither is
 * edited by walking backwards into it — going back to liveness would start a
 * fresh check a member already cleared, and going back to phone would strand
 * them mid-flow on a screen that spends a text. So Back exists from
 * `profile_basics` onward and stops there.
 *
 * The reducer has had `go_back` since it was written and nothing ever offered
 * it: every step rendered Continue and no way to correct the answer before it.
 * This is the half of that loop that faces the member.
 */
export function backStep(step: OnboardingStep): Exclude<OnboardingStep, typeof FINAL_STEP> | null {
  const first = stepIndex(FIRST_EDITABLE_STEP);
  const here = stepIndex(step);
  if (here <= first || here > stepIndex(FINAL_STEP)) return null;
  const previous = ONBOARDING_STEPS[here - 1];
  // `done` is last, so a previous step is never it — said in the type so
  // callers naming each step's heading do not need a branch that cannot run.
  if (previous === undefined || previous === FINAL_STEP) return null;
  return previous;
}

/**
 * Whether a member on `actual` may look at `wanted`.
 *
 * Backwards yes, forwards no. Typing a URL still cannot skip a step — which is
 * the whole reason requireStep exists, and §9.1 consent is the reason it
 * matters — but a member who mistyped their name four screens ago can now
 * reach it, which before this meant finishing onboarding and finding Settings.
 */
export function mayVisitStep(wanted: OnboardingStep, actual: OnboardingStep): boolean {
  if (wanted === actual) return true;
  if (stepIndex(wanted) > stepIndex(actual)) return false;
  return stepIndex(wanted) >= stepIndex(FIRST_EDITABLE_STEP);
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
  preferences: (f) => f.hasPreferences,
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
  return ONBOARDING_STEPS.filter((step) => step !== FINAL_STEP && !SETTLED_BY[step](facts));
}
