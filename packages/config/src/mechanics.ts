/**
 * Every tunable mechanic threshold. Decisions #10, #11, #12, #13, #15, #18, #20, #25
 * are all config-driven so weighting can tighten as density grows without a code change.
 *
 * These defaults mirror the launch values in the spec. The admin config editor (§7.3)
 * writes overrides to a config table that `packages/logic` hot-reads; these are the
 * fallbacks when no override exists.
 */

export const FUSE = {
  /** Decision #13 — 7 days per chat without a mutually confirmed date plan. */
  windowHours: 168,
  /** §6.2 — a cancelled plan re-arms the fuse rather than closing immediately. */
  reArmHoursAfterCancelledPlan: 72,
  /** §8 — "One of your chats closes tomorrow", content-blind. */
  warningHoursBeforeExpiry: 24,
  /**
   * Decision #13: pausing or extending a fuse is NEVER purchasable. There is no
   * premium exemption field here on purpose — see PREMIUM_NEVER in pricing.ts.
   */
} as const;

export const CONNECTS = {
  /** Decision #15 — viewing is unlimited; these cap initiation only. */
  freePerDay: 3,
  premiumPerDay: 10,
  /** Drop-card connects cost zero budget — this nudges toward curation over browsing. */
  dropConnectCost: 0,
  browseConnectCost: 1,
  /** Decision #18 — support-only outbound is room-scoped and weekly, not daily. */
  supportOnlyPerWeek: 3,
  /** §6.3 — unanswered connects expire kindly rather than lingering. */
  pendingExpiryDays: 7,
  /** §3.5 — optional personal line appended to a closure template. */
  personalLineMaxChars: 140,
} as const;

export const RADIUS = {
  /** Decision #12 — default search radius in miles. */
  defaultMi: 50,
  /** The ladder the drop climbs when the local pool is too thin. */
  ladderMi: [50, 100, 150, 250],
  /** §6.1 — expand while candidates fall below this. */
  minPool: 12,
  minMi: 5,
  maxMi: 250,
} as const;

export const DROP = {
  /** Decision #11 — same count for everyone, never varies by payment or intention. */
  count: 3,
  /** Local hour the drop lands, in the member's own timezone. */
  hourLocal: 20,
  /** §6.1 filters. */
  activeWithinDays: 14,
  suppressRecentlyServedDays: 30,
  /**
   * §6.1 scoring weights. Launch values; intention weight rises with density.
   * These never sum-check at runtime — the scorer normalises.
   */
  weights: {
    intentionCompat: 0.4,
    quizCompat: 0.3,
    recencyActive: 0.2,
    /** Counters winner-take-all so the same faces don't dominate every drop. */
    underexposure: 0.1,
  },
} as const;

export const COOLDOWNS = {
  /** Decision #8 — intention is changeable once per 30 days, so it means something. */
  intentionChangeDays: 30,
  /** Decision #20 — blocks toggle-flicker gaming of the support-only shield. */
  datingReentryDays: 30,
} as const;

export const REFERRALS = {
  /** §6.5 — conversion counts only when the invitee reaches `verified`. */
  inviteeGrantDays: 14,
  referrerGrantDaysPerConversion: 14,
  /** Rewards stop at 10; the public counter keeps counting forever. */
  rewardCap: 10,
  tiers: {
    tier1_3: { conversions: 3, grantDays: 30, autoGrant: true },
    tier2_5: { conversions: 5, grantDays: 0, autoGrant: true, badge: "Founding Member" },
    /** Decision #25 — tier 3 requires manual admin approval. */
    tier3_10: { conversions: 10, grantDays: 180, autoGrant: false },
  },
} as const;

export const DELETION = {
  /** §9.3 — hard delete means hard delete. Purge job sweeps after this window. */
  purgeAfterDays: 7,
} as const;

export const ROOMS = {
  /** §5.2 — v1 seed rooms. */
  seedSlugs: [
    "newly-diagnosed",
    "disclosure-stories",
    "hsv-general",
    "hiv-u-equals-u",
    "general-lounge",
  ],
  defaultSlowModeSeconds: 30,
} as const;

export const VERIFICATION = {
  /** Decision #21 — target time to verified on the clean path. */
  targetSeconds: 120,
  /** Manual review only on risk flags; retries before a human sees it. */
  livenessMaxRetries: 3,
} as const;
