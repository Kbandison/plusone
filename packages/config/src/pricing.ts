/**
 * Decision #22. Money is integer cents everywhere — never floats (BACKEND.md anti-pattern #6).
 * Stripe is the only place a legal name exists; the app DB never mirrors it (Decision #28).
 */

export type PlanId = "premium_1mo" | "premium_3mo" | "premium_6mo";

export type PriceIdEnvKey =
  "STRIPE_PRICE_PREMIUM_1MO" | "STRIPE_PRICE_PREMIUM_3MO" | "STRIPE_PRICE_PREMIUM_6MO";

export interface Plan {
  readonly id: PlanId;
  readonly months: number;
  readonly priceCents: number;
  readonly label: string;
  /** The 3-month tier is the highlighted default. */
  readonly highlighted: boolean;
  /**
   * Populated from Stripe at deploy time via env; never hardcoded per
   * environment. Typed as the exact keys rather than `string` so a plan cannot
   * name an environment variable that does not exist — the alternative is
   * finding out at checkout.
   */
  readonly envPriceIdKey: PriceIdEnvKey;
  /**
   * The App Store product ID, which is NOT derived from `id` and must never be
   * assumed to be.
   *
   * These are the strings Kevin created in App Store Connect on 2026-08-26, and
   * they are deliberately recorded rather than generated: an in-app purchase
   * product ID cannot be edited after it is created and cannot be reused after
   * it is deleted, so what is in the console is what the receipts will say for
   * the life of the app. Guessing a convention here and finding out at purchase
   * is the failure this field exists to prevent.
   *
   * They are unprefixed because that is what was entered, and it is fine:
   * uniqueness is scoped to the app rather than to the whole App Store. The one
   * consequence to know about is that another app under the same account cannot
   * reuse them.
   */
  readonly appleProductId: string;
  /**
   * The Play subscription product ID. Its own field, and deliberately not the
   * same field as `appleProductId` even though every value currently matches.
   *
   * They were briefly identical, because Kevin said he would rename Play's to
   * match Apple's and I wrote that down as though it had happened. It had not.
   * Play's real ids are `premium1month`, `premium3months` and `premium6months`,
   * read out of the Play Developer API on 2026-08-27 — the console is the
   * source of truth and this is a copy of it, and for a day this was a copy of
   * an intention instead.
   *
   * Which is the argument for the separate field, made by events: had the two
   * been collapsed into one `storeProductId` on the strength of their matching,
   * correcting Play would have silently broken Apple, whose ids are real and
   * unchanged. Two consoles, two permanent namespaces, and agreeing today is
   * not the same as being the same thing.
   *
   * This is the SUBSCRIPTION product id, not a base plan id. A TWA cannot
   * address a base plan at all: `getDetails()` takes product ids, a base plan id
   * returns an empty list, and a PaymentRequest naming one comes back
   * RESULT_CANCELED. That is why these are three separate subscriptions rather
   * than one carrying three base plans — see BACKLOG server lane 12.
   *
   * Permanent on the same terms as Apple's: a Play product id cannot be reused
   * after deletion.
   */
  readonly playProductId: string;
}

export const PLANS: readonly Plan[] = [
  {
    id: "premium_1mo",
    months: 1,
    priceCents: 1999,
    label: "1 month",
    highlighted: false,
    envPriceIdKey: "STRIPE_PRICE_PREMIUM_1MO",
    appleProductId: "1month",
    playProductId: "premium1month",
  },
  {
    id: "premium_3mo",
    months: 3,
    priceCents: 3999,
    label: "3 months",
    highlighted: true,
    envPriceIdKey: "STRIPE_PRICE_PREMIUM_3MO",
    appleProductId: "3months",
    playProductId: "premium3months",
  },
  {
    id: "premium_6mo",
    months: 6,
    priceCents: 6999,
    label: "6 months",
    highlighted: false,
    envPriceIdKey: "STRIPE_PRICE_PREMIUM_6MO",
    appleProductId: "6months",
    playProductId: "premium6months",
  },
] as const;

export const DEFAULT_PLAN_ID: PlanId = "premium_3mo";

export function getPlan(id: PlanId): Plan {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

/** Display helper — cents to "$19.99". Never do money math in components. */
export function formatPriceCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Decision #23/#24 — the paid line is reach and control. The free tier stays
 * genuinely usable: real messaging, real drops, real rooms.
 */
/**
 * What premium is, grouped by what it is FOR.
 *
 * ── why this stopped being five strings ─────────────────────────────────────
 *
 * It was a flat list of feature names — "Fine-grained photo privacy controls",
 * "Who's active near you" — read on two public pages by somebody deciding
 * whether to pay. Every one of them was accurate and none of them said what it
 * was for, which is a specification rather than an offer.
 *
 * Decision #23/#24 already names the line the tier is drawn on: REACH AND
 * CONTROL. The list never expressed it, so the two things premium actually does
 * were invisible behind five equal bullets.
 *
 * ── control comes first, and that is specific to this app ───────────────────
 *
 * On a dating app in general the exciting half is reach — more people, further,
 * faster. Here the premise is that disclosure is hard, and the deepest anxiety
 * a member brings is not going unmatched, it is being SEEN. Incognito and
 * per-photo privacy are the two strongest things in this tier for that reason
 * and they were listed third and fifth in mechanic language.
 *
 * ── and it still promises nothing on the never list ─────────────────────────
 *
 * The lead says outright that none of it makes you louder or moves you up a
 * list. That is not modesty; it is the sentence that stops somebody reading
 * "advanced filters" as pay-to-win, on a page where the next section is
 * PREMIUM_NEVER.
 */
export interface PremiumGroup {
  readonly id: string;
  /** The value, in the member's terms. Never a feature name. */
  readonly heading: string;
  readonly items: readonly { readonly title: string; readonly body: string }[];
}

/**
 * One sentence for the whole tier, above the groups.
 *
 * The second half matters as much as the first: the most common suspicion about
 * a paid tier on a dating app is that it buys rank, and saying it does not —
 * before the never-list rather than only in it — is the difference between a
 * denial and a design.
 */
export const PREMIUM_LEAD =
  "Premium changes two things: who can see you, and how far you can reach. It does not make you louder, and it does not move you up anybody's list.";

export const PREMIUM_INCLUDES: readonly PremiumGroup[] = [
  {
    id: "seen",
    heading: "Who can see you",
    items: [
      {
        title: "Browse without appearing",
        body: "Look at whoever you like. You stay visible only to people you have already connected with, and turning it off is never gated — a lapsed subscription cannot leave you stranded either way.",
      },
      {
        title: "Decide photo by photo",
        body: "Some clear, some blurred until you connect, on the same profile. Blurring everything stays free, always: safety is not the part you pay for.",
      },
    ],
  },
  {
    id: "reach",
    heading: "How far you reach",
    items: [
      {
        title: "Ten connects a day, instead of three",
        body: "Answering someone from tonight's Drop still costs nothing, on either tier.",
      },
      {
        /**
         * No counts, deliberately.
         *
         * The first draft said "nineteen filters, instead of four", which is
         * what the backlog says — and the source does not confirm it: the
         * filter table holds seventeen entries carrying a group, of which two
         * are `top`, so the rest live somewhere this file cannot see. A number
         * on a sales page that nobody can check against the code is one that
         * goes quietly wrong the first time a filter is added.
         *
         * What IS checkable is the line itself: `isPaidGroup` is
         * `group !== "top"`, and the four free ones are named in its comment.
         */
        title: "Every filter, not just the first four",
        body: "Distance, intention, activity and age stay free and always will. The rest — lifestyle, family, faith, work, languages — narrow the people you see to the ones you were looking for.",
      },
      {
        title: "Ask to be told when it is worth looking",
        body: "An alert you set yourself, with your own radius, off until you create it. The app will never nudge you on its own.",
      },
    ],
  },
];

/**
 * Kept as flat strings for anything that needs the old shape — a store listing,
 * a summary line. Derived rather than duplicated, so it cannot drift.
 */
export const PREMIUM_INCLUDE_TITLES: readonly string[] = PREMIUM_INCLUDES.flatMap((group) =>
  group.items.map((item) => item.title),
);

/**
 * Decision #24 + §3.3 — the sell-never list. This is not a product backlog;
 * it is a set of things that must never become purchasable. Referenced by tests.
 */
export const PREMIUM_NEVER = [
  "fuse extensions or timer pauses",
  "exemptions from closure notes",
  "bypassing the support-only wall",
  "bypassing the community wall",
  "extra drops",
  "visibility or ranking boosts",
  "undo",
] as const;
