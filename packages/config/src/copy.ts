/**
 * All user-facing copy, verbatim from spec §3.4, §3.5 and §9.1.
 *
 * RULE: never invent copy. If a string is missing here, stop and ask — do not
 * improvise one in a component. Strings with runtime values are exposed as
 * functions so the placeholder contract stays in one place.
 */

export const COPY = {
  marketing: {
    hero: "Dating with the talk already handled.",
    sub: "A private, verified community for people with HSV and HIV. Real people. Real privacy. Nobody gets ghosted.",
    verificationPitch:
      "Every profile here is a verified human. Two minutes, no waiting, no fakes.",
  },

  drop: {
    header: "Tonight's Drop",
    /** Shown when the local pool is genuinely thin. We never pad with stale profiles. */
    thin: "Fewer people near you tonight — we only show real, active members. Widen your radius or check back tomorrow.",
  },

  browse: {
    /** Honest activity stat — real counts only, never inflated. */
    activityStat: (activeCount: number, radiusMi: number) =>
      `${activeCount} people active this week within ${radiusMi} miles`,
  },

  radius: {
    /** Shown whenever the drop's radius ladder expanded past the member's own setting. */
    expansionNotice: (userRadiusMi: number, usedRadiusMi: number) =>
      `Not many people within ${userRadiusMi} miles yet — showing within ${usedRadiusMi} miles.`,
  },

  fuse: {
    explainer:
      "Every chat has 7 days to turn into a plan. If it doesn't, it closes kindly — for both of you. Nobody here gets left on read.",
  },

  intention: {
    lockNotice: "You can change this once every 30 days, so it means something.",
  },

  uEqualsU: {
    explainer:
      "Undetectable = Untransmittable. When HIV treatment keeps the virus undetectable, it can't be passed on. Self-reported.",
  },

  crossCommunity: {
    optIn:
      "Open to matching with members of other status communities? You'll only see each other if you both say yes.",
  },

  supportOnly: {
    toggle:
      "Support-only mode hides you from all dating — no drops, no browse, and nobody can send you a connect. You can still join every room, and you can reach out to people you meet there whenever you're ready.",
    previewCta: "Switch to dating to see and connect.",
    previewDensity: (datingCount: number, radiusMi: number, joinedThisMonth: number) =>
      `${datingCount} people dating within ${radiusMi} miles · ${joinedThisMonth} joined this month`,
  },

  referral: {
    shareLine:
      "Know someone from your group who'd want this? Your invite gives you both two weeks of Premium.",
    /** Invite landing is deliberately neutral — no condition language before tap-through. */
    landingHeadline: "You've been invited to Plus One",
    landingSub: "A private community built on trust and real connection.",
    landingButton: "See what it's about",
    /** Counter keeps counting past the reward cap. */
    counter: (joinedCount: number) => `${joinedCount} people joined through you`,
  },

  deletion: {
    confirmation:
      "Deleting your account permanently removes your profile, photos, messages, and all personal data within 7 days. This cannot be undone — and we mean actually deleted.",
  },

  consent: {
    heading: "Your health information",
    /**
     * The tick itself. It has to state what is being agreed to on its own —
     * that is what "unbundled" means — so it is part of the versioned consent
     * text, not chrome around it.
     */
    checkboxLabel: "I agree to Plus One storing the status I choose to share.",
    continueLabel: "Continue",
    policyLinkLabel: "Read how we handle health data",
    /** §9.1 — own screen, unbundled checkbox, consent timestamp stored. */
    healthData:
      "Plus One stores the status you choose to share (your community, condition type, and optional U=U badge) to run matching and community features. We never collect medical records, test results, or diagnosis details. We never sell or share your health information. You can delete everything, permanently, at any time.",
  },
} as const;

/**
 * §9.1 stores a `copy_version` alongside every consent, so a member's consent is
 * tied to the words they actually agreed to. Bump this whenever the wording
 * changes — a changed policy re-asks rather than inheriting the old tick.
 *
 * CONSENT_COPY_DIGEST guards that: it is the SHA-256 prefix of the consent body
 * AND the checkbox label, joined by a newline, checked by a unit test. The label
 * is in there because the label is what the member actually ticks; the heading
 * and the button are chrome and are not. Editing either without bumping the
 * version fails CI rather than silently carrying old consents forward.
 */
export const CONSENT_COPY_VERSION = {
  health_data: "2026-08-14",
} as const;

export const CONSENT_COPY_DIGEST = {
  health_data: "eb80a79862defeb7",
} as const;

export type ConsentKind = keyof typeof CONSENT_COPY_VERSION;

/**
 * §3.5 — the six closure note templates. Index is stored on the chat row as
 * `closure_template`, so ORDER IS STABLE. Append only; never reorder or remove.
 * Template 1 (index 0) is the default when a member pre-selected none.
 */
export const CLOSURE_TEMPLATES = [
  "This didn't turn into plans, and that's okay. Wishing you a real one. — {name}",
  "I've enjoyed talking, but I don't think we're each other's person. Rooting for you.",
  "Timing isn't right on my end. Thank you for the conversation.",
  "I'm going to focus on another connection. You deserve someone all-in.",
  "We didn't quite click, but you came across genuinely great.",
  "Closing this one out with respect. Take care of yourself.",
] as const;

export const DEFAULT_CLOSURE_TEMPLATE_INDEX = 0;

/** Render a closure template, substituting the sender's display name. */
export function renderClosureTemplate(index: number, senderName: string): string {
  const template = CLOSURE_TEMPLATES[index] ?? CLOSURE_TEMPLATES[DEFAULT_CLOSURE_TEMPLATE_INDEX];
  return template.replace("{name}", senderName);
}

/** §6.3 — auto-note delivered when a pending connect expires unanswered. */
export const CONNECT_EXPIRY_NOTE = "This one timed out — no hard feelings." as const;
