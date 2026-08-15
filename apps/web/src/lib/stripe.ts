import "server-only";

import Stripe from "stripe";

import { PLANS, parseServerEnv, type PlanId } from "@plusone/config";

/**
 * Stripe (§2 Decision #22, §9.7).
 *
 * Two rules this file exists to hold:
 *
 *   1. STRIPE HOLDS THE LEGAL NAME; OUR DATABASE NEVER DOES. §9.7. A payment
 *      processor has to know who is paying. Nothing here copies that back — the
 *      only things we store are a customer id, a subscription id, a status and
 *      a period end. There is no name field in `subscriptions` to fill in even
 *      by accident.
 *
 *   2. NOTHING IN PREMIUM_NEVER IS BUYABLE. A price id maps to a duration and
 *      nothing else. The gates read `is_premium()`, which knows how long
 *      someone has paid for and not what that buys them — so a checkout session
 *      cannot grant an exemption because there is no parameter for one.
 */

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (client) return client;
  const { STRIPE_SECRET_KEY } = parseServerEnv(process.env);
  client = new Stripe(STRIPE_SECRET_KEY, {
    // Pinned. An account-level API upgrade should not silently change what a
    // webhook payload looks like on a Tuesday.
    apiVersion: "2026-07-29.dahlia",
    typescript: true,
  });
  return client;
}

/** The Stripe price id for a plan, from the environment. */
export function priceIdFor(planId: PlanId): string {
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan) throw new Error(`Unknown plan: ${planId}`);

  const env = parseServerEnv(process.env);
  const priceId = env[plan.envPriceIdKey];
  if (!priceId) throw new Error(`No price id configured for ${planId}`);
  return priceId;
}

/** Reverse: which plan a price id belongs to, for the webhook. */
export function planIdForPrice(priceId: string): PlanId | null {
  const env = parseServerEnv(process.env);
  return PLANS.find((plan) => env[plan.envPriceIdKey] === priceId)?.id ?? null;
}
