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
   * They match because Kevin chose to make them match, which is worth having —
   * one string per tier means a log line naming `3months` is unambiguous. It is
   * a convenience, not a fact about the world: they are two consoles, each with
   * its own permanent namespace, and either can be forced to change without the
   * other moving. Collapsing them into one `storeProductId` would read as
   * removing duplication and would actually be removing the seam.
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
    playProductId: "1month",
  },
  {
    id: "premium_3mo",
    months: 3,
    priceCents: 3999,
    label: "3 months",
    highlighted: true,
    envPriceIdKey: "STRIPE_PRICE_PREMIUM_3MO",
    appleProductId: "3months",
    playProductId: "3months",
  },
  {
    id: "premium_6mo",
    months: 6,
    priceCents: 6999,
    label: "6 months",
    highlighted: false,
    envPriceIdKey: "STRIPE_PRICE_PREMIUM_6MO",
    appleProductId: "6months",
    playProductId: "6months",
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
export const PREMIUM_INCLUDES = [
  "10 connects a day",
  "Advanced browse filters",
  "Incognito browse — visible only to people you've already connected with",
  "Who's active near you",
  "Fine-grained photo privacy controls",
] as const;

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
