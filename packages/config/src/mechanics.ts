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

/**
 * One-time sign-in codes.
 *
 * A CEILING, not the length. Do not tighten it to whatever the codes happen to
 * be today.
 *
 * The length is a Supabase dashboard setting (Email OTP Length) and the two
 * channels need not agree: SMS through Twilio Verify is six digits, and the
 * email side has already been both eight and six inside two days. Nothing in
 * this repo can see that setting, and nothing server-side checks a length —
 * `sign-in/actions.ts` forwards the token to verifyOtp untouched — so the input
 * is the only place a mismatch shows, and it shows as silence.
 *
 * That is what happened on 2026-09-01: the box was hardcoded `maxLength={6}`
 * while the emails carried eight, so it kept the first six characters of a code
 * the member had typed correctly and Supabase refused a token that was never
 * wrong. Found by reading a delivered email, which no test here can do.
 *
 * Sized so either value fits without anybody editing this file.
 */
export const OTP = {
  /** The longest code any channel may send. */
  codeMaxLength: 8,
} as const;

export const RADIUS = {
  /** Decision #12 — default search radius in miles. */
  defaultMi: 50,
  /** The ladder the drop climbs when the local pool is too thin. */
  ladderMi: [50, 100, 150, 250],
  /** §6.1 — expand while candidates fall below this. */
  minPool: 12,
  minMi: 5,
  /**
   * The radii an activity alert is offered (server 18c). A ladder rather than
   * a free number: the alert fires on a §8 floor of five visible people, and a
   * member typing 7 would be choosing a radius that can essentially never
   * clear it.
   */
  alertLadderMi: [5, 10, 25, 50, 100, 250],
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
   * §6.1 scoring weights, at their thinnest. Intention rises from here with
   * density — see `density` below. The scorer normalises, so these never
   * sum-check at runtime.
   */
  weights: {
    intentionCompat: 0.4,
    quizCompat: 0.3,
    recencyActive: 0.2,
    /** Counters winner-take-all so the same faces don't dominate every drop. */
    underexposure: 0.1,
  },
  /**
   * Decision #10's "tightens as density grows", which was a sentence and is now
   * a mechanism.
   *
   * The weights above are the floor, and they are the right floor in a thin
   * area: insisting on intention where there are fourteen candidates means
   * serving somebody two cards instead of three, which is a worse night than a
   * slightly mismatched third. Where there are two hundred it is the opposite —
   * a `long_term` member has no business being shown `casual` profiles at 0.3
   * affinity when the area could fill the drop three times over on intention
   * alone.
   *
   * So intention climbs from its launch weight to `maxIntentionCompat` as the
   * pool grows from `minPool` to `saturationPool`, and nothing else moves: the
   * scorer normalises by the weight total, so raising one weight is the whole
   * of shifting the mix. Below `minPool` the weights are untouched, which means
   * launch behaves exactly as it did before this existed.
   *
   * Both values are tunable through §7.3 like the weights themselves. The
   * ceiling is a ceiling and not a target — an area twice as dense as
   * saturation does not get twice the tightening.
   */
  density: {
    /** Pool size at which intention weight reaches its ceiling. */
    saturationPool: 120,
    /** The most intention compatibility may be worth, however dense it gets. */
    maxIntentionCompat: 0.7,
  },
} as const;

export const COOLDOWNS = {
  /** Decision #8 — intention is changeable once per 30 days, so it means something. */
  intentionChangeDays: 30,
  /** Decision #20 — blocks toggle-flicker gaming of the support-only shield. */
  datingReentryDays: 30,
  /**
   * How long after a decline before the same person may be asked again.
   *
   * §7.4 step 4 has every state-transition RPC validate cooldowns; this is the
   * one for a decline, which had none. connect_permitted checked blocks and
   * modes, and connects_one_pending_ix only stops two SIMULTANEOUS asks — the
   * moment a connect went to 'declined' its status left 'pending' and a fresh
   * one inserted cleanly. Somebody could be asked, decline, and be asked again
   * the same minute, indefinitely.
   *
   * THE NUMBER IS NOT KEVIN'S. Thirty days is long enough to be a real answer
   * and short enough not to be a permanent ban on a person who simply was not
   * ready. It wants confirming. `app_config` key `cooldowns.decline_days`.
   */
  declineDays: 30,
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
  /**
   * The liveness score a member must clear, on 0–1.
   *
   * AWS publishes the bands: "a moderate confidence score threshold (e.g., 50
   * or 60) may be suitable to detect presentation attacks and some digital
   * injection attacks, while a high confidence score threshold (e.g., 80 or 90)
   * may be suitable to detect sophisticated digital injection attacks, such as
   * deep fake or pre-recorded videos."
   *
   * This was 0.8 — the deepfake band — and it was rejecting real people. Two
   * checks from one member, good light, screen brightness at maximum, scored
   * 78.448 and 78.412: SUCCEEDED at AWS both times, refused here both times, by
   * a point and a half. A score that reproducible is the member's face and
   * camera, not their conditions, so no amount of retrying would have moved it.
   *
   * 0.7 is chosen against the threat this product actually has. A dating app's
   * fake profile is somebody holding up a photograph, a printed face or a
   * screen — a PRESENTATION attack, which AWS covers from the moderate band up.
   * Defending against pre-recorded deepfakes at the cost of turning away real
   * members inverts the risk: this app's members are people with HSV or HIV who
   * may try once, and a member wrongly refused does not come back to argue.
   *
   * It is also what the floor was always documented to be — a backstop UNDER
   * the vendor's own threshold, not the gate itself. At 0.8 it was the gate.
   *
   * The net under this is Decision #21: three failures reach a human, so a
   * borderline score delays somebody rather than ending them.
   */
  livenessMinScore: 0.7,
} as const;

export const RETENTION = {
  /**
   * How long a blocked-away thread's messages survive before the nightly purge.
   *
   * THE NUMBER IS CLAUDE'S RECOMMENDATION, NOT KEVIN'S DECISION.
   *
   * Under thirty days loses the late report, which is the common one — people
   * block in the moment and file afterwards. Much beyond ninety and the most
   * sensitive rows in this database sit around for a reason nobody can name:
   * these are the messages of a health community, and §9's posture is to keep
   * less for less long. Ninety is the ordinary safety-retention window and is
   * defensible as data minimisation rather than as convenience.
   *
   * An open report holds a thread past this, and a resolved one holds it for
   * the same window again from its RESOLUTION — so a slow moderation queue
   * cannot quietly destroy the evidence it has not read yet.
   *
   * The database reads app_config key `retention.blocked_thread_days`, so it is
   * tunable from the config editor. This constant is what the member is told.
   */
  blockedThreadDays: 90,
} as const;

/**
 * The longest a display name may be.
 *
 * Mirrors `profiles_display_name_len` in 20260813000200. It was a local const
 * in the onboarding action and nowhere else — so the moment a second screen
 * could change a name there were two numbers for one column, and only the
 * database's would have been true.
 */
export const MAX_DISPLAY_NAME = 40;
