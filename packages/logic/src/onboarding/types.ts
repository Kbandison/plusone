/**
 * Onboarding (§7.2).
 *
 * phone OTP -> liveness -> profile basics -> community + condition ->
 * health-data consent -> intention -> quiz -> photos -> radius -> done.
 * Target under eight minutes.
 *
 * Two structural properties this module exists to guarantee:
 *
 *   1. CONSENT IS ITS OWN STEP AND THE GENERIC ADVANCE CANNOT PASS IT. §9.1
 *      requires an own screen with an unbundled checkbox, so `complete` fails
 *      on the consent step; only `grant_consent`, which carries the timestamp
 *      §9.1 says to store, moves a member past it. Bundling consent into
 *      another screen is not something this machine can express.
 *
 *      Note the conflict with §7.2, which describes the checkbox as part of the
 *      community + condition screen. §9 is headed "build requirements, not
 *      aspirations" and unbundled consent is the stricter reading, so it wins
 *      here. Flagged for review.
 *
 *   2. ONLY THE QUIZ IS SKIPPABLE. §7.2 marks it "skippable-but-nudged" and
 *      marks nothing else. SKIPPABLE_STEPS is the single source of that, and
 *      `skip` fails on every step outside it.
 */

export type OnboardingStep =
  | "phone"
  | "liveness"
  | "profile_basics"
  | "community_condition"
  | "health_consent"
  | "intention"
  | "quiz"
  | "photos"
  | "radius"
  | "done";

/** The §7.2 order. Position in this array IS the order — nothing else encodes it. */
export const ONBOARDING_STEPS = [
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
] as const satisfies readonly OnboardingStep[];

/** The terminal step. Not something a member "completes". */
export const FINAL_STEP = "done" satisfies OnboardingStep;

/**
 * The earliest step a member may walk back into.
 *
 * Everything before it is verification rather than profile data — a confirmed
 * number and a passed liveness check — and neither is corrected by revisiting
 * the screen that produced it.
 */
export const FIRST_EDITABLE_STEP = "profile_basics" satisfies OnboardingStep;

/** §7.2 marks the quiz "skippable-but-nudged" and marks nothing else. */
export const SKIPPABLE_STEPS = ["quiz"] as const satisfies readonly OnboardingStep[];

export type SkippableStep = (typeof SKIPPABLE_STEPS)[number];

export interface OnboardingState {
  readonly step: OnboardingStep;
  /** Steps finished, in the order they were finished. */
  readonly completed: readonly OnboardingStep[];
  /** Steps the member chose to skip. Only ever the quiz. */
  readonly skipped: readonly OnboardingStep[];
  /**
   * Epoch ms of the unbundled health-data consent (§9.1 — "Consent timestamp
   * stored"). Null until the member ticks the box themselves.
   */
  readonly consentGrantedAt: number | null;
}

export type OnboardingEvent =
  /** Finish the current step. Deliberately powerless on `health_consent`. */
  | { readonly type: "complete"; readonly at: number }
  /** Skip the current step. Legal only on SKIPPABLE_STEPS. */
  | { readonly type: "skip"; readonly at: number }
  /** The unbundled tick. The only way past `health_consent`. */
  | { readonly type: "grant_consent"; readonly at: number }
  /** Return to the previous step to edit an answer. */
  | { readonly type: "go_back"; readonly at: number };

export type OnboardingErrorCode =
  | "already_finished"
  | "step_not_skippable"
  | "consent_required"
  | "not_on_consent_step"
  | "consent_already_granted"
  | "nothing_to_go_back_to";

export type OnboardingResult =
  | { readonly ok: true; readonly state: OnboardingState }
  | { readonly ok: false; readonly code: OnboardingErrorCode };

/**
 * What the database knows about a member's progress, as booleans.
 *
 * Deliberately not the profile row: this package stays free of database shapes,
 * and a boolean per step is the whole of what the resolver needs. The mapping
 * from row to facts lives in the app, where the row does.
 */
export interface OnboardingFacts {
  readonly phoneVerified: boolean;
  readonly livenessPassed: boolean;
  readonly hasBasics: boolean;
  readonly hasCommunity: boolean;
  readonly hasHealthConsent: boolean;
  readonly hasIntention: boolean;
  readonly quizSettled: boolean;
  readonly hasPhoto: boolean;
  readonly radiusSet: boolean;
}

export const NO_PROGRESS: OnboardingFacts = {
  phoneVerified: false,
  livenessPassed: false,
  hasBasics: false,
  hasCommunity: false,
  hasHealthConsent: false,
  hasIntention: false,
  quizSettled: false,
  hasPhoto: false,
  radiusSet: false,
};
