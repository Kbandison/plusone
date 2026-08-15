import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  FINAL_STEP,
  INITIAL_ONBOARDING_STATE,
  ONBOARDING_STEPS,
  SKIPPABLE_STEPS,
  hasHealthConsent,
  NO_PROGRESS,
  isFinished,
  isSkippable,
  progress,
  remainingSteps,
  stepIndex,
  resolveStep,
  transition,
  unsettledSteps,
  type OnboardingEvent,
  type OnboardingFacts,
  type OnboardingState,
  type OnboardingStep,
} from "./index";

const AT = 1_700_000_000_000;

function drive(state: OnboardingState, ...events: OnboardingEvent[]): OnboardingState {
  let current = state;
  for (const event of events) {
    const result = transition(current, event);
    if (!result.ok) {
      throw new Error(`unexpected failure on ${event.type} at ${current.step}: ${result.code}`);
    }
    current = result.state;
  }
  return current;
}

/** Walks to `target` the only way the machine allows. */
function walkTo(target: OnboardingStep): OnboardingState {
  let state = INITIAL_ONBOARDING_STATE;
  while (state.step !== target) {
    const event: OnboardingEvent =
      state.step === "health_consent"
        ? { type: "grant_consent", at: AT }
        : { type: "complete", at: AT };
    state = drive(state, event);
  }
  return state;
}

describe("the §7.2 order", () => {
  it("starts at the phone step", () => {
    expect(INITIAL_ONBOARDING_STATE.step).toBe("phone");
  });

  it("runs phone -> liveness -> basics -> community -> consent -> intention -> quiz -> photos -> radius -> done", () => {
    expect([...ONBOARDING_STEPS]).toEqual([
      "phone",
      "liveness",
      "profile_basics",
      "community_condition",
      "health_consent",
      "intention",
      "quiz",
      "photos",
      "radius",
      "done",
    ]);
  });

  it("reaches done by completing every step in order", () => {
    const state = walkTo(FINAL_STEP);
    expect(isFinished(state)).toBe(true);
    expect(state.completed).toEqual(ONBOARDING_STEPS.slice(0, -1));
  });

  it("accepts nothing once finished", () => {
    const done = walkTo(FINAL_STEP);
    for (const type of ["complete", "skip", "grant_consent"] as const) {
      expect(transition(done, { type, at: AT })).toEqual({ ok: false, code: "already_finished" });
    }
  });

  it("goes back to edit an answer without losing progress", () => {
    const atIntention = walkTo("intention");
    const back = drive(atIntention, { type: "go_back", at: AT });
    expect(back.step).toBe("health_consent");
    expect(back.completed).toEqual(atIntention.completed);
  });

  it("cannot go back from the first step", () => {
    expect(transition(INITIAL_ONBOARDING_STATE, { type: "go_back", at: AT })).toEqual({
      ok: false,
      code: "nothing_to_go_back_to",
    });
  });

  it("does not record a step twice when it is revisited", () => {
    const atIntention = walkTo("intention");
    const redone = drive(
      atIntention,
      { type: "go_back", at: AT },
      { type: "go_back", at: AT },
      {
        type: "complete",
        at: AT,
      },
    );
    const occurrences = redone.completed.filter((s) => s === "community_condition").length;
    expect(occurrences).toBe(1);
  });
});

// §9.1 — "Health-data consent screen (own screen, unbundled checkbox)".
describe("consent is unbundled", () => {
  it("is its own step, not folded into community + condition", () => {
    expect(ONBOARDING_STEPS).toContain("health_consent");
    expect(stepIndex("health_consent")).toBe(stepIndex("community_condition") + 1);
  });

  // The whole point: a generic "next" must not be able to carry consent with
  // it, because that is precisely what a bundled checkbox does.
  it("cannot be passed by the generic advance", () => {
    const atConsent = walkTo("health_consent");
    expect(transition(atConsent, { type: "complete", at: AT })).toEqual({
      ok: false,
      code: "consent_required",
    });
  });

  it("cannot be skipped", () => {
    const atConsent = walkTo("health_consent");
    expect(transition(atConsent, { type: "skip", at: AT })).toEqual({
      ok: false,
      code: "step_not_skippable",
    });
  });

  // The other half of unbundled: no pre-ticking on an earlier screen.
  it.each(ONBOARDING_STEPS.filter((s) => s !== "health_consent"))(
    "cannot be granted from the %s step",
    (step) => {
      if (step === FINAL_STEP) return; // covered by the already_finished case
      const state = walkTo(step);
      expect(transition(state, { type: "grant_consent", at: AT })).toEqual({
        ok: false,
        code: "not_on_consent_step",
      });
    },
  );

  it("stores the timestamp §9.1 requires", () => {
    const granted = drive(walkTo("health_consent"), { type: "grant_consent", at: AT });
    expect(granted.consentGrantedAt).toBe(AT);
    expect(hasHealthConsent(granted)).toBe(true);
  });

  it("is not granted before the member ticks the box", () => {
    expect(hasHealthConsent(walkTo("health_consent"))).toBe(false);
  });

  it("does not re-ask after going back past it", () => {
    const granted = drive(walkTo("health_consent"), { type: "grant_consent", at: AT });
    const back = drive(granted, { type: "go_back", at: AT });
    expect(back.step).toBe("health_consent");
    expect(back.consentGrantedAt).toBe(AT);
    expect(transition(back, { type: "grant_consent", at: AT + 1 })).toEqual({
      ok: false,
      code: "consent_already_granted",
    });
  });

  it("keeps the original timestamp when the member walks back and forward", () => {
    const granted = drive(walkTo("health_consent"), { type: "grant_consent", at: AT });
    const roundTrip = drive(
      granted,
      { type: "go_back", at: AT + 5 },
      { type: "go_back", at: AT + 6 },
      {
        type: "complete",
        at: AT + 7,
      },
    );
    expect(roundTrip.consentGrantedAt).toBe(AT);
  });
});

describe("only the quiz is skippable", () => {
  it("lists exactly one skippable step", () => {
    expect([...SKIPPABLE_STEPS]).toEqual(["quiz"]);
  });

  it("skips the quiz and records it as skipped, not completed", () => {
    const atQuiz = walkTo("quiz");
    const skipped = drive(atQuiz, { type: "skip", at: AT });
    expect(skipped.step).toBe("photos");
    expect(skipped.skipped).toEqual(["quiz"]);
    expect(skipped.completed).not.toContain("quiz");
  });

  it.each(ONBOARDING_STEPS.filter((s) => s !== "quiz" && s !== FINAL_STEP))(
    "refuses to skip %s",
    (step) => {
      expect(transition(walkTo(step), { type: "skip", at: AT })).toEqual({
        ok: false,
        code: "step_not_skippable",
      });
    },
  );

  it("agrees with isSkippable across every step", () => {
    for (const step of ONBOARDING_STEPS) {
      expect(isSkippable(step)).toBe(step === "quiz");
    }
  });

  it("still reaches done with the quiz skipped", () => {
    let state = walkTo("quiz");
    state = drive(state, { type: "skip", at: AT });
    while (!isFinished(state)) state = drive(state, { type: "complete", at: AT });
    expect(state.step).toBe(FINAL_STEP);
  });
});

describe("progress", () => {
  it("reads zero at the start and one at the end", () => {
    expect(progress(INITIAL_ONBOARDING_STATE).fraction).toBe(0);
    expect(progress(walkTo(FINAL_STEP)).fraction).toBe(1);
  });

  it("does not count `done` as a task", () => {
    expect(progress(INITIAL_ONBOARDING_STATE).total).toBe(ONBOARDING_STEPS.length - 1);
  });

  it("advances monotonically through the flow", () => {
    let state = INITIAL_ONBOARDING_STATE;
    let last = -1;
    while (!isFinished(state)) {
      const { fraction } = progress(state);
      expect(fraction).toBeGreaterThan(last);
      last = fraction;
      state = drive(
        state,
        state.step === "health_consent"
          ? { type: "grant_consent", at: AT }
          : { type: "complete", at: AT },
      );
    }
  });

  it("lists what is left, excluding done", () => {
    expect(remainingSteps(walkTo("photos"))).toEqual(["photos", "radius"]);
    expect(remainingSteps(walkTo(FINAL_STEP))).toEqual([]);
  });
});

describe("purity", () => {
  it("does not mutate the state it is given", () => {
    const before = walkTo("intention");
    const snapshot = structuredClone(before);
    transition(before, { type: "complete", at: AT });
    expect(before).toEqual(snapshot);
  });

  it("is deterministic", () => {
    const state = walkTo("photos");
    expect(transition(state, { type: "complete", at: AT })).toEqual(
      transition(state, { type: "complete", at: AT }),
    );
  });
});

describe("structural guarantees", () => {
  const source = readFileSync(fileURLToPath(new URL("./types.ts", import.meta.url)), "utf8");

  it("names the quiz as the only skippable step in the source", () => {
    const block = /export const SKIPPABLE_STEPS = \[([\s\S]*?)\]/.exec(source)?.[1] ?? "";
    expect(block.match(/"/g)?.length).toBe(2);
    expect(block).toContain('"quiz"');
  });

  // If a future edit merges consent into another screen, this fails first.
  it("keeps health_consent a step of its own", () => {
    const block = /export const ONBOARDING_STEPS = \[([\s\S]*?)\] as const/.exec(source)?.[1] ?? "";
    expect(block).toContain('"health_consent"');
    expect(block).toContain('"community_condition"');
  });
});

describe("resuming where you left off", () => {
  type FactKey = keyof OnboardingFacts;

  const settledThrough = (step: OnboardingStep): OnboardingFacts => {
    const upTo = ONBOARDING_STEPS.slice(0, stepIndex(step));
    const byStep: Record<string, FactKey> = {
      phone: "phoneVerified",
      liveness: "livenessPassed",
      profile_basics: "hasBasics",
      community_condition: "hasCommunity",
      health_consent: "hasHealthConsent",
      intention: "hasIntention",
      quiz: "quizSettled",
      photos: "hasPhoto",
      radius: "radiusSet",
    };
    const facts = { ...NO_PROGRESS };
    for (const s of upTo) {
      const key = byStep[s];
      if (key) facts[key] = true;
    }
    return facts;
  };

  it("sends a brand new member to the phone step", () => {
    expect(resolveStep(NO_PROGRESS)).toBe("phone");
  });

  it("sends a fully settled member to done", () => {
    expect(resolveStep(settledThrough(FINAL_STEP))).toBe(FINAL_STEP);
  });

  it.each(ONBOARDING_STEPS.filter((s) => s !== FINAL_STEP))(
    "lands a member who stopped before %s back on it",
    (step) => {
      expect(resolveStep(settledThrough(step))).toBe(step);
    },
  );

  // A member who takes a phone call mid-flow should not re-answer four screens.
  // §7.2 targets under eight minutes and that is how the target gets missed.
  it("does not send a member back past work they already did", () => {
    const facts = settledThrough("photos");
    expect(stepIndex(resolveStep(facts))).toBeGreaterThanOrEqual(stepIndex("photos"));
  });

  // The ordering is the gate: consent missing sends a member back to it even
  // when everything after is already answered — which is exactly what happens
  // when the wording changes and the old tick stops counting.
  it("returns to consent when consent is missing, however far along they are", () => {
    const facts: OnboardingFacts = { ...settledThrough(FINAL_STEP), hasHealthConsent: false };
    expect(resolveStep(facts)).toBe("health_consent");
  });

  it("returns to the earliest gap, not the furthest step reached", () => {
    const facts: OnboardingFacts = { ...settledThrough(FINAL_STEP), hasBasics: false };
    expect(resolveStep(facts)).toBe("profile_basics");
  });

  it("agrees with unsettledSteps about what is left", () => {
    const facts = settledThrough("intention");
    expect(unsettledSteps(facts)[0]).toBe(resolveStep(facts));
    expect(unsettledSteps(settledThrough(FINAL_STEP))).toEqual([]);
  });

  it("treats a skipped quiz as settled", () => {
    const facts: OnboardingFacts = { ...settledThrough("quiz"), quizSettled: true };
    expect(resolveStep(facts)).toBe("photos");
  });

  it("is pure — the facts it is given come back unchanged", () => {
    const facts = settledThrough("intention");
    const snapshot = structuredClone(facts);
    resolveStep(facts);
    unsettledSteps(facts);
    expect(facts).toEqual(snapshot);
  });
});

describe("health_consent is not a trap", () => {
  // Every event refused here except go_back, and walking forward re-entered it,
  // so onboarding could never finish once a member walked back past consent.
  const T0 = Date.UTC(2026, 0, 1);

  const walkTo = (step: string): OnboardingState => {
    let state = INITIAL_ONBOARDING_STATE;
    for (let i = 0; i < 12 && state.step !== step; i += 1) {
      const result = transition(state, { type: "complete", at: T0 });
      if (!result.ok) break;
      state = result.state;
    }
    return state;
  };

  it("lets a member walk back past consent and forward again", () => {
    const atConsent = walkTo("health_consent");
    const granted = transition(atConsent, { type: "grant_consent", at: T0 });
    expect(granted.ok).toBe(true);
    if (!granted.ok) return;

    let state = granted.state;
    for (let i = 0; i < 2; i += 1) {
      const back = transition(state, { type: "go_back", at: T0 });
      expect(back.ok).toBe(true);
      if (!back.ok) return;
      state = back.state;
    }

    // Forward again, all the way to the end.
    for (let i = 0; i < 12 && state.step !== "done"; i += 1) {
      const result = transition(state, { type: "complete", at: T0 });
      if (!result.ok && state.step === "quiz") {
        const skipped = transition(state, { type: "skip", at: T0 });
        expect(skipped.ok).toBe(true);
        if (!skipped.ok) return;
        state = skipped.state;
        continue;
      }
      expect(result.ok, `stuck on ${state.step}`).toBe(true);
      if (!result.ok) return;
      state = result.state;
    }
    expect(state.step).toBe("done");
  });

  it("still refuses to pass consent that was never given", () => {
    const atConsent = walkTo("health_consent");
    expect(atConsent.consentGrantedAt).toBeNull();
    const result = transition(atConsent, { type: "complete", at: T0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("consent_required");
  });

  it("keeps the original timestamp when consent is re-passed", () => {
    const atConsent = walkTo("health_consent");
    const granted = transition(atConsent, { type: "grant_consent", at: T0 });
    if (!granted.ok) return;
    const back = transition(granted.state, { type: "go_back", at: T0 });
    if (!back.ok) return;
    const forward = transition(back.state, { type: "complete", at: T0 + 99_999 });
    expect(forward.ok).toBe(true);
    if (forward.ok) expect(forward.state.consentGrantedAt).toBe(T0);
  });
});
