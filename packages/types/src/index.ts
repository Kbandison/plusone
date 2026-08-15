/**
 * Domain types.
 *
 * The enum unions below mirror the SQL enums in
 * supabase/migrations/20260813000100_extensions_and_enums.sql exactly. When the
 * Supabase project exists, `pnpm db:types` regenerates `./database.ts` from the
 * live schema and these unions become the hand-checked contract it must satisfy.
 */

export type ConditionCommunity = "hsv" | "hiv";

export type ConditionDetail = "hsv1" | "hsv2" | "hsv1_hsv2" | "hiv" | "hiv_hsv";

export type Intention = "long_term" | "open_to_either" | "casual" | "friends_support";

export type MemberMode = "dating" | "support_only";

export type PhotoPrivacy = "clear" | "blurred_until_connected";

export type VerificationStatus =
  "unverified" | "phone_verified" | "liveness_pending" | "verified" | "flagged" | "rejected";

export type ConnectStatus = "pending" | "accepted" | "declined" | "expired";

export type ConnectSource = "drop" | "browse" | "room";

export type ChatStatus = "open" | "date_planned" | "closed_fuse" | "closed_by_member" | "graduated";

export type RoomScope = "all" | "hsv" | "hiv";

export type ReferralTier = "tier1_3" | "tier2_5" | "tier3_10";

export type RewardStatus =
  "auto_granted" | "pending_approval" | "approved" | "denied" | "clawed_back";

export type ReportReason =
  "fake_profile" | "harassment" | "sexual_content" | "spam_or_scam" | "underage" | "other";

export type ModerationStatus = "open" | "in_review" | "resolved" | "dismissed";

export type DeletionStatus = "requested" | "purging" | "purged" | "cancelled";

export type ConsentKind = "health_data" | "terms" | "privacy_policy";

/**
 * A row from `visible_profiles` — the ONLY shape in which one member sees
 * another. There is deliberately no `Profile` type carrying birthdate or
 * location: if those cannot be named, they cannot accidentally be rendered.
 */
export interface VisibleProfile {
  id: string;
  displayName: string;
  age: number;
  ageBand: string;
  gender: string | null;
  seeking: string[];
  community: ConditionCommunity;
  condition: ConditionDetail;
  uEqualsU: boolean;
  intention: Intention;
  mode: MemberMode;
  bio: string | null;
  prompts: ProfilePrompt[];
  photoPrivacy: PhotoPrivacy;
  lastActiveAt: string;
  distanceMi: number | null;
}

/**
 * A Preview Drop card (Decision #19). Name and exact distance are absent because
 * the view never returns them — the redaction is server-side, not a CSS blur.
 */
export interface PreviewProfile {
  id: string;
  ageBand: string;
  intention: Intention;
  distanceBucketMi: number | null;
}

export interface ProfilePrompt {
  id: string;
  question: string;
  answer: string;
}

export interface VisibleProfilePhoto {
  userId: string;
  position: number;
  storagePath: string;
  isBlurred: boolean;
}

/** The viewer's own profile. Still no birthdate or raw coordinates. */
export interface OwnProfile {
  id: string;
  displayName: string;
  age: number;
  gender: string | null;
  seeking: string[];
  community: ConditionCommunity;
  condition: ConditionDetail;
  uEqualsU: boolean;
  crossCommunityOptIn: boolean;
  intention: Intention;
  intentionChangedAt: string;
  mode: MemberMode;
  modeDatingReentryAt: string | null;
  searchRadiusMi: number;
  timezone: string;
  bio: string | null;
  prompts: ProfilePrompt[];
  photoPrivacy: PhotoPrivacy;
  verificationStatus: VerificationStatus;
  lastActiveAt: string;
}

export interface Connect {
  id: string;
  initiatorId: string;
  targetId: string;
  promptId: string;
  promptReply: string;
  status: ConnectStatus;
  source: ConnectSource;
  roomId: string | null;
  expiresAt: string;
  decidedAt: string | null;
  declineTemplate: number | null;
  declinePersonalLine: string | null;
  createdAt: string;
}

export interface Chat {
  id: string;
  connectId: string;
  status: ChatStatus;
  fuseExpiresAt: string | null;
  datePlan: unknown | null;
  closureTemplate: number | null;
  closurePersonalLine: string | null;
  closedBy: string | null;
  closedAt: string | null;
  createdAt: string;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  body: string | null;
  voiceNotePath: string | null;
  voiceNoteSeconds: number | null;
  createdAt: string;
}

export interface Room {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  communityScope: RoomScope;
  slowModeSeconds: number;
}

/** One served Drop (§6.1). `radiusUsedMi` drives the on-screen honesty line. */
export interface Drop {
  id: string;
  dropDate: string;
  servedProfileIds: string[];
  radiusUsedMi: number;
  isPreview: boolean;
}
