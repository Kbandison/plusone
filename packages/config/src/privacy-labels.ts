/**
 * What the App Store and Play privacy labels declare, and what makes each one
 * true.
 *
 * A privacy label is a public legal statement that has to keep matching a
 * codebase nobody re-reads when they add a column. It is re-affirmed at every
 * submission, months apart, usually by whoever is closest to the deadline. The
 * failure is not that somebody lies — it is that a feature lands, the labels
 * are never revisited, and the declaration quietly stops being true.
 *
 * So this file is not documentation. `privacy-labels.test.ts` reads the
 * migrations and fails when a table or a profile column appears that nothing
 * here classifies. Adding one is meant to be mildly annoying: it makes somebody
 * decide, at the moment they add it, which declaration it belongs to.
 *
 * Derived 2026-08-25 from the schema and cross-read against `legal.ts`, because
 * Apple compares the labels against the published policy and the two
 * contradicting each other is worse than either being wrong alone.
 */

/**
 * Apple's own category names, spelled the way the App Store Connect form spells
 * them so a value here can be copied into it without translation.
 */
export type AppleDataCategory =
  | "Health & Fitness → Health"
  | "Sensitive Info"
  | "Contact Info → Name"
  | "Contact Info → Email Address"
  | "Contact Info → Phone Number"
  | "Location → Coarse Location"
  | "User Content → Photos or Videos"
  | "User Content → Audio Data"
  | "User Content → Other User Content"
  | "Identifiers → User ID"
  | "Purchases";

export interface PrivacyLabel {
  readonly category: AppleDataCategory;
  /** Plain words, for the person filling the form. */
  readonly what: string;
  /** Where it lives. The test does not read these — a human does, in review. */
  readonly justifiedBy: readonly string[];
  /** Apple's purposes. Every one of these is App Functionality; see `TRACKING`. */
  readonly purpose: "App Functionality";
  /** Everything here hangs off an account, so all of it is linked. */
  readonly linkedToUser: true;
}

export const PRIVACY_LABELS: readonly PrivacyLabel[] = [
  {
    category: "Health & Fitness → Health",
    what: "Community, condition type, and the optional U=U badge.",
    justifiedBy: ["profiles.community", "profiles.condition", "profiles.u_equals_u", "consents"],
    purpose: "App Functionality",
    linkedToUser: true,
  },
  {
    category: "Sensitive Info",
    what:
      "Sexual orientation. Never asked for directly — it is what gender and seeking " +
      "amount to in a dating context, and Apple's category names it explicitly.",
    justifiedBy: ["profiles.gender", "profiles.seeking"],
    purpose: "App Functionality",
    linkedToUser: true,
  },
  {
    category: "Contact Info → Phone Number",
    what: "The number that signs a member in.",
    justifiedBy: ["auth.users.phone"],
    purpose: "App Functionality",
    linkedToUser: true,
  },
  {
    category: "Contact Info → Email Address",
    what: "Optional. Signs in with a code, and carries notifications if switched on.",
    justifiedBy: ["auth.users.email", "emails_for()"],
    purpose: "App Functionality",
    linkedToUser: true,
  },
  {
    category: "Contact Info → Name",
    what: "A chosen display name, which does not have to be a legal one and never is asked to be.",
    justifiedBy: ["profiles.display_name"],
    purpose: "App Functionality",
    linkedToUser: true,
  },
  {
    category: "Location → Coarse Location",
    what:
      "Coarse and not precise, which is a property of the schema rather than a promise: " +
      "round_location() truncates to 2 decimal places (~1.1km) in a BEFORE trigger, so the " +
      "exact position never enters the database at all.",
    justifiedBy: ["profiles.location", "round_location()", "profiles.search_radius_mi"],
    purpose: "App Functionality",
    linkedToUser: true,
  },
  {
    category: "User Content → Photos or Videos",
    what: "Profile photos, including the blurred copy kept for members who choose it.",
    justifiedBy: ["profile_photos"],
    purpose: "App Functionality",
    linkedToUser: true,
  },
  {
    category: "User Content → Audio Data",
    what: "Voice messages recorded in a chat.",
    justifiedBy: ["messages.kind = 'voice'"],
    purpose: "App Functionality",
    linkedToUser: true,
  },
  {
    category: "User Content → Other User Content",
    what: "Message bodies, room posts, bio, prompts, quiz answers, and the text of a report.",
    justifiedBy: [
      "messages",
      "room_messages",
      "profiles.bio",
      "profiles.prompts",
      "quiz_responses",
      "reports",
    ],
    purpose: "App Functionality",
    linkedToUser: true,
  },
  {
    category: "Identifiers → User ID",
    what: "The account id, and the device token a push is addressed to.",
    justifiedBy: ["profiles.id", "push_subscriptions.endpoint"],
    purpose: "App Functionality",
    linkedToUser: true,
  },
  {
    category: "Purchases",
    what: "Subscription state and referral rewards. No card details — see NOT_COLLECTED.",
    justifiedBy: ["subscriptions", "premium_grants", "referral_rewards"],
    purpose: "App Functionality",
    linkedToUser: true,
  },
];

/**
 * Answered NO on the form, each for a reason that is checkable rather than
 * asserted. The test guards the ones a future change could quietly reverse.
 */
export const NOT_COLLECTED = [
  {
    category: "Location → Precise Location",
    because:
      "round_location() rounds to 2 decimal places in a BEFORE INSERT/UPDATE trigger. " +
      "The precise value is never stored, so it cannot leak from the database.",
  },
  {
    category: "Financial Info → Payment Info",
    because:
      "The processor holds the card and the legal name; this database holds neither. " +
      "On iOS, StoreKit holds them instead. Purchases are declared; payment details are not.",
  },
  {
    category: "Sensitive Info → biometric data (the liveness check)",
    because:
      "The video streams from the device to Rekognition and nothing survives it: no face " +
      "collection, no matching, OutputConfig unset so AWS has nowhere to write, " +
      "AuditImagesLimit at its default of 0, and LivenessOutcome has no field that could " +
      "hold an image. legal.ts lists the selfie under 'What we never store'. " +
      "HELD FOR COUNSEL: whether real-time processing by a processor that retains nothing " +
      "counts as collection under Apple's definition. Declare it if they say so — the cost " +
      "is one line, and under-declaring on a health app is found later rather than never.",
  },
  {
    category: "Diagnostics, Usage Data, Browsing History, Search History, Contacts",
    because: "No SDK collects any of it. There is no analytics package in the app at all.",
  },
] as const;

/**
 * The single most consequential answer on the form, and the easiest to reverse
 * by accident: adding any analytics or advertising SDK would make this false.
 */
export const TRACKING = {
  used: false,
  because:
    "Nothing is shared with data brokers or advertisers, and no third-party ad or analytics " +
    "pixel exists in the app. Declaring tracking would also require an ATT prompt.",
} as const;

/**
 * Every table the migrations create, and which declaration it feeds.
 *
 * An empty `feeds` is a positive statement — somebody looked and decided it
 * carries nothing a label covers — so it still needs a note saying why.
 */
export const TABLE_CLASSIFICATION: Readonly<
  Record<string, { readonly feeds: readonly AppleDataCategory[]; readonly note: string }>
> = {
  profiles: {
    feeds: [
      "Health & Fitness → Health",
      "Sensitive Info",
      "Contact Info → Name",
      "Location → Coarse Location",
      "User Content → Other User Content",
      "Identifiers → User ID",
    ],
    note: "The richest table here. Column-level classification below.",
  },
  profile_photos: { feeds: ["User Content → Photos or Videos"], note: "Profile photos." },
  messages: {
    feeds: ["User Content → Other User Content", "User Content → Audio Data"],
    note: "Text and voice notes share the table; kind distinguishes them.",
  },
  room_messages: { feeds: ["User Content → Other User Content"], note: "Room posts." },
  quiz_responses: {
    feeds: ["User Content → Other User Content"],
    note: "Answers and the derived trait vector. Matching only.",
  },
  reports: {
    feeds: ["User Content → Other User Content"],
    note: "A member's own words describing what happened.",
  },
  consents: {
    feeds: ["Health & Fitness → Health"],
    note: "Records that health-data consent was given, and to which wording.",
  },
  push_subscriptions: {
    feeds: ["Identifiers → User ID"],
    note: "A web push endpoint or a native device token.",
  },
  subscriptions: { feeds: ["Purchases"], note: "Subscription state." },
  premium_grants: { feeds: ["Purchases"], note: "Granted premium, including referral rewards." },
  referral_rewards: { feeds: ["Purchases"], note: "What a referral earned." },
  referrals: { feeds: ["Identifiers → User ID"], note: "Who invited whom." },
  referral_conversions: { feeds: ["Identifiers → User ID"], note: "Which invite converted." },

  chats: { feeds: ["Identifiers → User ID"], note: "Who is talking to whom; no content." },
  chat_reads: { feeds: ["Identifiers → User ID"], note: "Read position. No content." },
  connects: { feeds: ["Identifiers → User ID"], note: "Who reached out to whom." },
  connect_budgets: { feeds: [], note: "A daily counter per member. No content, no profile field." },
  drops: { feeds: ["Identifiers → User ID"], note: "Who was shown to whom." },
  blocks: { feeds: ["Identifiers → User ID"], note: "Who blocked whom." },
  room_members: { feeds: ["Identifiers → User ID"], note: "Membership of a room." },
  room_likes: { feeds: ["Identifiers → User ID"], note: "Who liked a post." },
  room_reads: { feeds: [], note: "Read position within a room." },
  room_post_views: { feeds: [], note: "View counts. Aggregate." },
  notifications: {
    feeds: ["Identifiers → User ID"],
    note: "Content-blind by construction (§9.6) — an event kind and an id, never a body.",
  },
  notification_mutes: { feeds: [], note: "A member's own switches." },
  deletion_requests: { feeds: ["Identifiers → User ID"], note: "That deletion was asked for." },
  moderation_queue: {
    feeds: ["User Content → Other User Content"],
    note: "Holds reported content for review.",
  },
  audit_log: {
    feeds: [],
    note:
      "Deliberately carries no member content: ids and event kinds only, and no condition " +
      "information in any event (§9.6). logs-are-blind.test.ts enforces it.",
  },

  rooms: { feeds: [], note: "The rooms themselves. Seeded, not member data." },
  news_items: { feeds: [], note: "Editorial content. Not member data." },
  app_config: { feeds: [], note: "Tunables. Not member data." },
  admin_users: { feeds: [], note: "Who may reach the admin surface. Staff, not members." },
};

/**
 * Every column on `profiles`, and what it is for the purposes of the form.
 *
 * `operational` means it exists to run the product and is not itself a declared
 * category — a timestamp, a preference, a state flag. It is still linked to the
 * member; it simply is not one of Apple's data types.
 */
export const PROFILE_COLUMN_CLASSIFICATION: Readonly<
  Record<string, AppleDataCategory | "operational">
> = {
  id: "Identifiers → User ID",
  display_name: "Contact Info → Name",
  birthdate: "operational",
  gender: "Sensitive Info",
  seeking: "Sensitive Info",
  community: "Health & Fitness → Health",
  condition: "Health & Fitness → Health",
  u_equals_u: "Health & Fitness → Health",
  cross_community_opt_in: "operational",
  intention: "operational",
  intention_changed_at: "operational",
  mode: "operational",
  mode_dating_reentry_at: "operational",
  location: "Location → Coarse Location",
  search_radius_mi: "operational",
  timezone: "operational",
  bio: "User Content → Other User Content",
  prompts: "User Content → Other User Content",
  photo_privacy: "operational",
  verification_status: "operational",
  verified_at: "operational",
  last_active_at: "operational",
  created_at: "operational",
  updated_at: "operational",
};

/**
 * Apple's literal constants for the manifest, one per declared category.
 *
 * Verified against Apple's own documentation JSON on 2026-08-26 rather than
 * recalled — the list is not guessable. `NSPrivacyCollectedDataTypePhotosorVideos`
 * really does spell "or" in lowercase, and a value Apple does not recognise is
 * not a warning: `PrivacyInfo.xcprivacy` is read by App Store Connect at upload.
 *
 * Kept beside the declarations so the manifest cannot drift from them —
 * privacy-labels.test.ts checks the shipped file against this map in both
 * directions.
 */
export const MANIFEST_DATA_TYPE: Readonly<Record<AppleDataCategory, string>> = {
  "Health & Fitness → Health": "NSPrivacyCollectedDataTypeHealth",
  "Sensitive Info": "NSPrivacyCollectedDataTypeSensitiveInfo",
  "Contact Info → Name": "NSPrivacyCollectedDataTypeName",
  "Contact Info → Email Address": "NSPrivacyCollectedDataTypeEmailAddress",
  "Contact Info → Phone Number": "NSPrivacyCollectedDataTypePhoneNumber",
  "Location → Coarse Location": "NSPrivacyCollectedDataTypeCoarseLocation",
  "User Content → Photos or Videos": "NSPrivacyCollectedDataTypePhotosorVideos",
  "User Content → Audio Data": "NSPrivacyCollectedDataTypeAudioData",
  "User Content → Other User Content": "NSPrivacyCollectedDataTypeOtherUserContent",
  "Identifiers → User ID": "NSPrivacyCollectedDataTypeUserID",
  Purchases: "NSPrivacyCollectedDataTypePurchaseHistory",
};
