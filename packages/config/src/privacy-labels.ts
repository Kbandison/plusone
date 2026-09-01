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

  /**
   * Bug reports and feature requests.
   *
   * Same label as `reports` and for the same reason — free text a member typed
   * — but a different table, and the migration header for 20260831000300 says
   * why they must not merge.
   *
   * ── the three context columns, and why none adds a category ────────────────
   *
   * `surface`, `page` and `app_version` are facts about the SOFTWARE. That is
   * a claim the schema enforces rather than a description:
   *
   *   surface      one of four literals, by CHECK constraint.
   *   app_version  a deploy sha.
   *   page         the route SHAPE, never the path — `/app/chats/[id]` and
   *                never `/app/chats/3f2a…`. Stripped in lib/feedback.ts,
   *                refused by feedback_page_shape, and pinned by a test that
   *                plants a uuid and a query string.
   *
   * That last one is the whole reason this entry does not also feed
   * "Identifiers → User ID". A literal path would carry a chat id, and a chat
   * id on this app resolves to two people and a diagnosis — so the stripping is
   * not a nicety, it is what keeps this declaration true.
   */
  feedback: {
    feeds: ["User Content → Other User Content"],
    note: "A member's own words about the app, plus which screen shape, which shell and which build. No path, no ids.",
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
  iap_entitlements: {
    feeds: ["Purchases"],
    // Same label as `subscriptions` and for the same reason: it records that a
    // subscription was bought and when it ends. What differs is only who took
    // the money. The store's transaction id is a handle for the purchase rather
    // than for the person, and no Apple ID or Google account is stored — the
    // binding to a member is our own user_id.
    note: "A subscription bought through the App Store or Play.",
  },
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
  activity_alerts: {
    feeds: ["Identifiers → User ID"],
    note: "A member's own saved alert. The radius is operational for the same reason profiles.search_radius_mi is — it is a setting about what to show, not a place. Nothing here records where anybody was, and no row names anyone but its owner.",
  },
  deletion_requests: { feeds: ["Identifiers → User ID"], note: "That deletion was asked for." },

  /**
   * The waitlist, and the one table here that holds a NON-member.
   *
   * ── it feeds Contact Info, and nothing else ─────────────────────────────────
   *
   * An address and a metro. No condition, no community, no U=U, no birthdate,
   * no name and no phone — WAITLIST_NEVER in waitlist.ts is the explicit list,
   * with the argument against each, and waitlist.test.ts reads the migration
   * and fails on a column matching any of them.
   *
   * ── why the metro is NOT declared as Coarse Location ────────────────────────
   *
   * This is the judgement call in this entry and it goes the other way from
   * `profiles`, so it is worth stating rather than assuming.
   *
   * Apple's Location categories are about a device's position — something
   * derived from GPS, a network, or an IP. The metro here is none of those: it
   * is a value a person chose from a dropdown, about where they would like to
   * be told about, and it is stored exactly as chosen with nothing measured. A
   * member who picks "Atlanta, GA" while sitting in Chicago has told us the
   * truth about what they want and nothing at all about where they are.
   *
   * `profiles.location` is the opposite — a real position, rounded by a trigger
   * — which is why that one IS declared and why Precise Location is answered
   * NO rather than left out.
   *
   * If this ever starts being prefilled from an IP or a geolocation call, that
   * reasoning collapses and this entry becomes Coarse Location. Nothing does
   * that today, and WAITLIST_NEVER refuses `ip` for the same reason.
   */
  waitlist: {
    feeds: ["Contact Info → Email Address"],
    note: "An address and a chosen metro, for somebody with no account. Deleted outright on leaving, and swept if never confirmed.",
  },
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
  // Server 18a. A switch about who may see the member, in the same family as
  // mode and search_radius_mi: it changes what the product shows, and it is not
  // itself a fact about the person. Nothing about it is disclosed to anybody —
  // the whole point is that it withholds.
  incognito: "operational",
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

  // ── added after the table was created ──────────────────────────────────────
  // The six below landed in 20260818000100 and were never classified, because
  // the suite that enforces this read only the original `create table` block.
  // It reads `add column` too now. The eight after them are 20260829000100.
  //
  // Nothing here declares a NEW Apple category: every one resolves to a
  // category PRIVACY_LABELS already carries, which is why play-data-safety.ts
  // is untouched by any of it.

  // A search preference. It says who this member wants to see, not anything
  // about the member — the same reason search_radius_mi is operational.
  age_min: "operational",
  age_max: "operational",

  // Structured answers a member writes on their profile for other members to
  // read, which is what "Other User Content" is. Not Health & Fitness: Apple's
  // Health type is medical and sensor data, and "drinks sometimes" on a dating
  // profile is neither. The same argument covers exercise and height below —
  // this app's Health declaration is about `condition`, and stretching it to
  // cover lifestyle answers would blur the one label that most needs to stay
  // precise.
  smokes: "User Content → Other User Content",
  drinks: "User Content → Other User Content",
  kids: "User Content → Other User Content",
  kids_plan: "User Content → Other User Content",
  height_cm: "User Content → Other User Content",
  exercise: "User Content → Other User Content",
  // The enum is omnivore/pescatarian/vegetarian/vegan/other, which is why this
  // is not Sensitive Info. A diet list carrying `kosher` or `halal` WOULD be —
  // it would collect religious belief by proxy — and that is the line to hold
  // if anybody widens it.
  diet: "User Content → Other User Content",
  pets: "User Content → Other User Content",
  education: "User Content → Other User Content",
  // A field of work, never an employer or a job title.
  work: "User Content → Other User Content",

  // Sensitive Info, and deliberately the conservative reading of two fields
  // Apple's list does not name outright.
  //
  // Relationship structure is not sexual orientation, which is what Apple
  // actually enumerates — but monogamous/open/polyamorous is adjacent enough
  // that the honest answer is the careful one, and `gender` and `seeking` above
  // are already classified this way on exactly that reasoning.
  relationship_structure: "Sensitive Info",
  // Language is not ethnic data either, and it is a strong proxy for it. Free,
  // since Sensitive Info is declared regardless — and a category chosen because
  // it costs nothing is a bad reason to choose the weaker one.
  languages: "Sensitive Info",

  // ── and seven more the widened suite turned up ─────────────────────────────
  // Not part of the filter work at all. Found by fixing the discovery above,
  // which is the point of fixing it: six columns were expected and thirteen
  // were unclassified.
  //
  // All operational — timestamps and state flags recording that something
  // happened, none of them a fact about the member that Apple names.
  onboarded_at: "operational",
  appeal_opened_at: "operational",
  appeal_decided_at: "operational",
  drop_notified_night: "operational",
  nearby_notified_at: "operational",

  // These two are operational and they are the two worth pausing on, because
  // the thing they record IS biometric.
  //
  // Neither holds any of it. `liveness_passed_at` is a timestamp; the video
  // streamed to Rekognition and nothing survived it — no face collection, no
  // matching, OutputConfig unset, AuditImagesLimit at 0. The declaration that
  // covers the check itself is in PRIVACY_LABELS above, and it is the entry
  // that is HELD FOR COUNSEL. That question is about the processing, not about
  // these columns, and classifying them as anything else here would be an
  // attempt to answer it in the wrong file.
  liveness_passed_at: "operational",
  // A vendor's session reference, kept to re-check an outcome. It points at a
  // record; it does not contain one.
  liveness_session_id: "operational",

  // ── 20260829000200 ─────────────────────────────────────────────────────────
  // The two that were held on 20260829000100 and added on Kevin's answer.
  //
  // Sensitive Info without argument, unlike the conservative calls above:
  // Apple's own enumeration names "religious or philosophical beliefs" and
  // "political opinion" outright, and GDPR Article 9 puts both in the same tier
  // as the health data this product is built around.
  //
  // Still no NEW category, since Sensitive Info is already declared — so
  // play-data-safety.ts does not move for these either. What they DO oblige is
  // the policy: Kevin 1 is open, and religious and political belief should be
  // named there among what a member may choose to publish. They are not yet.
  religion: "Sensitive Info",
  politics: "Sensitive Info",

  // ── 20260829000300 ─────────────────────────────────────────────────────────
  // Health, and the only column in this whole batch that is not User Content or
  // Sensitive Info.
  //
  // Everything else added on 2026-08-29 was deliberately kept OUT of the Health
  // declaration, on the argument that it is about `condition` and that
  // stretching it to cover "drinks sometimes" blurs the one label that most
  // needs to stay precise. Body weight is the exception rather than a crack in
  // that rule: it is what HealthKit stores, Apple's Health type names it, and
  // on an app whose pool is defined by a diagnosis it correlates with treatment
  // history — wasting and lipodystrophy — which makes it a proxy for health
  // status without ever naming one.
  //
  // No new category; Health is already declared. What it changes is the SCOPE
  // of that declaration, from three fields behind a consent screen and a
  // community wall to one a member types onto a profile other members read.
  // That belongs in Kevin 1 with religion and politics.
  weight_kg: "Health & Fitness → Health",
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
