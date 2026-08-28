import { NOT_COLLECTED, PRIVACY_LABELS, TRACKING, type AppleDataCategory } from "./privacy-labels";

/**
 * Play's Data safety form, mapped from the facts `privacy-labels.ts` already
 * settled.
 *
 * This is deliberately NOT a second set of decisions. The two stores ask the
 * same questions about the same schema in different vocabularies, and the
 * dangerous failure is answering them independently months apart and drifting —
 * a public declaration on one store contradicting the public declaration on the
 * other, with the codebase matching neither. So every entry here names the
 * Apple category it comes from, and `play-data-safety.test.ts` fails when a
 * label exists with nowhere to go.
 *
 * The Apple side is already held against the migrations: adding a table nothing
 * classifies breaks that test. This one hangs off the same chain, so a new
 * column has to pass both.
 *
 * ── one place Play is genuinely better, and it settles a held question ───────
 *
 * Apple's form asks whether data is COLLECTED, with no room for "it passes
 * through and nothing survives it". That is why the liveness selfie sits in
 * `NOT_COLLECTED` with a note held for counsel: the honest answer does not fit
 * the question.
 *
 * Play asks separately whether data is "processed ephemerally" — collected,
 * used, and not retained. That is exactly what the liveness check does, so the
 * Play answer can be both complete and true today without waiting on anybody.
 * It is declared here, and the reasoning is worth keeping: declaring MORE than
 * Apple is not an inconsistency between the two forms, it is two forms with
 * different resolution being answered accurately.
 */

/** Play's own section and type names, spelled as the console spells them. */
export type PlayDataType =
  | "Location → Approximate location"
  | "Personal info → Name"
  | "Personal info → Email address"
  | "Personal info → User IDs"
  | "Personal info → Phone number"
  | "Personal info → Sexual orientation"
  | "Financial info → Purchase history"
  | "Health and fitness → Health info"
  | "Messages → Other in-app messages"
  | "Photos and videos → Photos"
  | "Audio files → Voice or sound recordings"
  | "App activity → Other user-generated content"
  | "Device or other IDs → Device or other IDs";

/** Play's purpose list. Only the ones this app can honestly tick. */
export type PlayPurpose =
  "App functionality" | "Account management" | "Fraud prevention, security, and compliance";

export interface PlayDataSafetyEntry {
  readonly type: PlayDataType;
  /**
   * Which Apple label this is the same fact as. `null` only where Play asks
   * something Apple's form has no equivalent question for — every such entry
   * has to justify itself in `why`.
   */
  readonly fromAppleCategory: AppleDataCategory | null;
  /** Collected. Always true here; a type that is not collected is simply absent. */
  readonly collected: true;
  /**
   * Shared with third parties, in Play's sense: transferred to another company.
   * False everywhere, and it must stay that way while `TRACKING.used` is false.
   * A processor acting on our instructions is not sharing under Play's
   * definition, which is why Rekognition and the payment processors do not make
   * this true.
   */
  readonly shared: false;
  /**
   * Play's own escape hatch: used in memory and never written down. Ticking it
   * exempts the type from the retention question, and it is only honest where
   * nothing persists.
   */
  readonly processedEphemerally: boolean;
  /** Whether a member can use the app without providing it. */
  readonly optional: boolean;
  readonly purposes: readonly PlayPurpose[];
  readonly why: string;
}

export const PLAY_DATA_SAFETY: readonly PlayDataSafetyEntry[] = [
  {
    type: "Health and fitness → Health info",
    fromAppleCategory: "Health & Fitness → Health",
    collected: true,
    shared: false,
    processedEphemerally: false,
    optional: false,
    purposes: ["App functionality"],
    why: "Community and condition type are what the whole product is organised around; there is no account without one.",
  },
  {
    type: "Personal info → Sexual orientation",
    fromAppleCategory: "Sensitive Info",
    collected: true,
    shared: false,
    processedEphemerally: false,
    optional: false,
    purposes: ["App functionality"],
    why: "Never asked for directly. Gender and seeking amount to it in a dating context, and both stores name the category explicitly.",
  },
  {
    type: "Personal info → Phone number",
    fromAppleCategory: "Contact Info → Phone Number",
    collected: true,
    shared: false,
    processedEphemerally: false,
    optional: false,
    purposes: ["App functionality", "Account management"],
    why: "The number that signs a member in. There is no other way in.",
  },
  {
    type: "Personal info → Email address",
    fromAppleCategory: "Contact Info → Email Address",
    collected: true,
    shared: false,
    processedEphemerally: false,
    optional: true,
    purposes: ["App functionality", "Account management"],
    why: "Optional throughout. Adds a second sign-in route and carries notifications only if switched on — no event defaults to email.",
  },
  {
    type: "Personal info → Name",
    fromAppleCategory: "Contact Info → Name",
    collected: true,
    shared: false,
    processedEphemerally: false,
    optional: false,
    purposes: ["App functionality"],
    why: "A chosen display name. Never required to be a legal one and never asked to be.",
  },
  {
    type: "Personal info → User IDs",
    fromAppleCategory: "Identifiers → User ID",
    collected: true,
    shared: false,
    processedEphemerally: false,
    optional: false,
    purposes: ["App functionality", "Account management"],
    why: "The account id every row hangs off, and what makes all of the above 'linked to the user' rather than anonymous.",
  },
  {
    type: "Device or other IDs → Device or other IDs",
    fromAppleCategory: "Identifiers → User ID",
    collected: true,
    shared: false,
    processedEphemerally: false,
    optional: true,
    purposes: ["App functionality"],
    why: "The push endpoint a notification is addressed to. Only exists if notifications are switched on, hence optional. Apple files this under the same label; Play separates it, so it gets its own row.",
  },
  {
    type: "Location → Approximate location",
    fromAppleCategory: "Location → Coarse Location",
    collected: true,
    shared: false,
    processedEphemerally: false,
    optional: false,
    purposes: ["App functionality"],
    why: "Approximate by construction, not by promise: round_location() truncates to ~1.1km in a BEFORE trigger, so the precise value never reaches the database. Precise location is declared NOT collected for that reason.",
  },
  {
    type: "Photos and videos → Photos",
    fromAppleCategory: "User Content → Photos or Videos",
    collected: true,
    shared: false,
    processedEphemerally: false,
    optional: false,
    purposes: ["App functionality"],
    why: "Profile photos, including the blurred copy kept for members who choose one.",
  },
  {
    type: "Audio files → Voice or sound recordings",
    fromAppleCategory: "User Content → Audio Data",
    collected: true,
    shared: false,
    processedEphemerally: false,
    optional: true,
    purposes: ["App functionality"],
    why: "Voice messages in a chat. Nobody has to send one.",
  },
  {
    type: "Messages → Other in-app messages",
    fromAppleCategory: "User Content → Other User Content",
    collected: true,
    shared: false,
    processedEphemerally: false,
    optional: false,
    purposes: ["App functionality"],
    why: "Direct messages and room posts. Play splits messages from other user content; Apple does not, so this and the row below share one Apple label.",
  },
  {
    type: "App activity → Other user-generated content",
    fromAppleCategory: "User Content → Other User Content",
    collected: true,
    shared: false,
    processedEphemerally: false,
    optional: false,
    purposes: ["App functionality"],
    why: "Bio, prompts, quiz answers, and the text of a report.",
  },
  {
    type: "Financial info → Purchase history",
    fromAppleCategory: "Purchases",
    collected: true,
    shared: false,
    processedEphemerally: false,
    optional: true,
    purposes: ["App functionality", "Account management"],
    why: "Subscription state and referral rewards. Card details are held by the store or the processor and never by us — 'User payment info' is answered NO.",
  },
  {
    /**
     * The entry Apple's form cannot express, and the reason this file is not
     * just a translation table.
     */
    type: "Photos and videos → Photos",
    fromAppleCategory: null,
    collected: true,
    shared: false,
    processedEphemerally: true,
    optional: false,
    purposes: ["Fraud prevention, security, and compliance"],
    why: "The liveness selfie. Streams to the verification provider and nothing survives it — no face collection, no matching, OutputConfig unset so there is nowhere to write, AuditImagesLimit at its default of 0. Declared here as processed ephemerally, which is Play's own category for exactly this and which Apple's form has no equivalent of. That is why it sits in NOT_COLLECTED on the Apple side with a note held for counsel; the two forms are not in conflict, they have different resolution.",
  },
];

/**
 * The security section, which is four checkboxes and one URL.
 *
 * `deletionUrl` is the one people forget: Play requires a route to deletion
 * that does NOT need the app installed, separately from the in-app one. The
 * in-app path is Settings, which `requestDeletion` implements and `legal.ts`
 * promises; this is the same promise made reachable from a browser.
 */
export const PLAY_SECURITY = {
  encryptedInTransit: true,
  /** `request_deletion` sets a purge date and the nightly job removes the rows. */
  usersCanRequestDeletion: true,
  followsFamiliesPolicy: false,
  independentSecurityReview: false,
  deletionUrl: "https://www.loveplusone.app/privacy#deletion",
} as const;

/**
 * Play data types answered NO, where saying no is a claim worth being able to
 * defend rather than a blank left unticked.
 */
export const PLAY_NOT_COLLECTED = [
  "Location → Precise location",
  "Financial info → User payment info",
  "Financial info → Credit score",
  "Personal info → Race and ethnicity",
  "Personal info → Political or religious beliefs",
  "Personal info → Address",
  "App activity → App interactions, in-app search history, installed apps",
  "App info and performance → Crash logs, diagnostics, other performance data",
  "Web browsing → Web browsing history",
  "Contacts",
  "Calendar",
  "Files and docs",
] as const;

/**
 * Ticked nowhere, and the reason is the same one that makes `TRACKING.used`
 * false: there is no analytics or advertising SDK in this app at all. Adding
 * one makes several answers above wrong at once, which is what the test is for.
 */
export const PLAY_NO_ADVERTISING = {
  containsAds: false,
  because: TRACKING.because,
} as const;

/** Every Apple label that must be represented, for the drift test. */
export const APPLE_CATEGORIES_COVERED: readonly AppleDataCategory[] = PRIVACY_LABELS.map(
  (label) => label.category,
);

/** Re-exported so the test can assert the two files still agree. */
export { NOT_COLLECTED, PRIVACY_LABELS, TRACKING };
