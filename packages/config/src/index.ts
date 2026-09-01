export { BRAND, PITCH, BANNED_COPY_TERMS, BANNED_PRIVACY_CLAIMS } from "./brand";

export {
  COPY,
  CLOSURE_TEMPLATES,
  DEFAULT_CLOSURE_TEMPLATE_INDEX,
  renderClosureTemplate,
  CONNECT_EXPIRY_NOTE,
  CONSENT_COPY_VERSION,
  CONSENT_COPY_DIGEST,
} from "./copy";
export type { ConsentKind } from "./copy";

export {
  FUSE,
  CONNECTS,
  RADIUS,
  DROP,
  COOLDOWNS,
  REFERRALS,
  DELETION,
  ROOMS,
  VERIFICATION,
  RETENTION,
  MAX_DISPLAY_NAME,
} from "./mechanics";

export {
  PLANS,
  DEFAULT_PLAN_ID,
  getPlan,
  formatPriceCents,
  PREMIUM_INCLUDES,
  PREMIUM_NEVER,
} from "./pricing";
export type { Plan, PlanId, PriceIdEnvKey } from "./pricing";

export {
  MUTABLE_EVENTS,
  NOTIFICATIONS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_DEFAULTS,
  PUSH_APP_NAME,
  EMAIL_SUBJECT,
  NEARBY_JOIN_MIN_COUNT,
  NOTIFY_TIMING,
  CONTENT_BLIND_BANNED_TERMS,
} from "./notifications";
export type { NotificationChannel, NotificationEvent, NotificationTemplate } from "./notifications";

export { clientEnvSchema, serverEnvSchema, parseClientEnv, parseServerEnv } from "./env";
export type { ClientEnv, ServerEnv } from "./env";

export {
  PRIVACY_POLICY,
  PRIVACY_POLICY_INTRO,
  PRIVACY_POLICY_EFFECTIVE,
  HEALTH_DATA_ANCHOR,
} from "./legal";
export type { PolicySection } from "./legal";

export {
  DRAFT_COPY,
  CONDITION_LABELS,
  GENDER_LABELS,
  SEEKING_LABELS,
  FREQUENCY_LABELS,
  SMOKING_TRAIT_LABELS,
  DRINKING_TRAIT_LABELS,
  KIDS_LABELS,
  KIDS_PLAN_LABELS,
  RELATIONSHIP_STRUCTURE_LABELS,
  DIET_LABELS,
  PETS_LABELS,
  EDUCATION_LABELS,
  WORK_LABELS,
  LANGUAGE_LABELS,
  RELIGION_LABELS,
  POLITICS_LABELS,
  LANGUAGES_MAX,
  EXERCISE_TRAIT_LABELS,
  formatHeight,
  HEIGHT_MIN_CM,
  HEIGHT_MAX_CM,
  formatWeight,
  WEIGHT_MIN_KG,
  WEIGHT_MAX_KG,
  COMMUNITY_LABELS,
  CONDITIONS_BY_COMMUNITY,
  allowsUEqualsU,
  isValidPair,
  QUIZ_QUESTIONS,
  QUIZ_QUESTION_COUNT,
  QUIZ_TRAITS,
  INTENTION_LABELS,
  PROFILE_PROMPTS,
  REPORT_REASONS,
  REPORT_DETAIL_MAX_CHARS,
  PROMPT_ANSWER_MAX_CHARS,
  MAX_PROMPTS,
  promptQuestion,
  NOTIFICATION_LINES,
  NOTIFICATION_EVENT_LABELS,
  NOTIFICATION_CHANNEL_LABELS,
} from "./draft-copy";
export type {
  NotificationLine,
  Community,
  ConditionDetail,
  Intention,
  ProfilePromptId,
  ProfilePromptAnswer,
  ReportReason,
  QuizTrait,
  QuizQuestion,
  QuizOption,
} from "./draft-copy";

export {
  METROS,
  METRO_IDS,
  isMetro,
  metroLabel,
  WAITLIST_NEVER,
  WAITLIST_DOUBLE_OPT_IN,
  WAITLIST_UNCONFIRMED_TTL_DAYS,
  WAITLIST_EMAIL,
  WAITLIST_INVITE_TTL_DAYS,
  WAITLIST_METRO_TARGET,
  BETA_INSTALL,
  BETA_LINKS,
  BETA_MANUAL_STEP,
  PLAY_TRACK,
} from "./waitlist";
export type { Metro, WaitlistEmail, BetaInstall, BetaPlatform } from "./waitlist";

export { COMMUNITY_GUIDELINES, GUIDELINES_INTRO, FAQ } from "./guidelines";
export type { Section, FaqEntry } from "./guidelines";

export { HOW_IT_WORKS, HOW_IT_WORKS_INTRO, PRICING_INTRO, PRICING_NEVER_NOTE } from "./marketing";
export type { HowItWorksStep } from "./marketing";

export { TERMS, TERMS_INTRO, TERMS_EFFECTIVE } from "./terms";
export { CHILD_SAFETY, CHILD_SAFETY_INTRO } from "./child-safety";
export type { ChildSafetySection } from "./child-safety";
export type { TermsSection } from "./terms";

export {
  NEWS_SOURCES,
  shouldPublishNews,
  newsAllowedHosts,
  type NewsScope,
  type NewsSource,
} from "./news";
