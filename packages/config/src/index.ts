export {
  BRAND,
  PITCH,
  BANNED_COPY_TERMS,
  BANNED_PRIVACY_CLAIMS,
} from "./brand";

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
} from "./mechanics";

export {
  PLANS,
  DEFAULT_PLAN_ID,
  getPlan,
  formatPriceCents,
  PREMIUM_INCLUDES,
  PREMIUM_NEVER,
} from "./pricing";
export type { Plan, PlanId } from "./pricing";

export {
  NOTIFICATIONS,
  PUSH_APP_NAME,
  EMAIL_SUBJECT,
  NEARBY_JOIN_MIN_COUNT,
  CONTENT_BLIND_BANNED_TERMS,
} from "./notifications";
export type { NotificationEvent, NotificationTemplate } from "./notifications";

export {
  clientEnvSchema,
  serverEnvSchema,
  parseClientEnv,
  parseServerEnv,
} from "./env";
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
  COMMUNITY_LABELS,
  CONDITIONS_BY_COMMUNITY,
  allowsUEqualsU,
  isValidPair,
  QUIZ_QUESTIONS,
  INTENTION_LABELS,
  PROFILE_PROMPTS,
  PROMPT_ANSWER_MAX_CHARS,
  MAX_PROMPTS,
  promptQuestion,
} from "./draft-copy";
export type {
  Community,
  ConditionDetail,
  Intention,
  ProfilePromptId,
  ProfilePromptAnswer,
} from "./draft-copy";
