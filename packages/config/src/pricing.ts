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
}

export const PLANS: readonly Plan[] = [
  {
    id: "premium_1mo",
    months: 1,
    priceCents: 1999,
    label: "1 month",
    highlighted: false,
    envPriceIdKey: "STRIPE_PRICE_PREMIUM_1MO",
  },
  {
    id: "premium_3mo",
    months: 3,
    priceCents: 3999,
    label: "3 months",
    highlighted: true,
    envPriceIdKey: "STRIPE_PRICE_PREMIUM_3MO",
  },
  {
    id: "premium_6mo",
    months: 6,
    priceCents: 6999,
    label: "6 months",
    highlighted: false,
    envPriceIdKey: "STRIPE_PRICE_PREMIUM_6MO",
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
