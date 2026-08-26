"use server";

import { redirect } from "next/navigation";

import { DRAFT_COPY, PLANS, parseClientEnv, type PlanId } from "@plusone/config";

import { priceIdFor, stripe } from "@/lib/stripe";
import { getServerSupabase } from "@/lib/supabase";
import {
  alreadyPayingAStore,
  stripeIsLive,
  type EntitlementRow,
  type StripeRow,
} from "@/lib/subscription-source";
import type { CheckoutState } from "./state";

const C = DRAFT_COPY.app;

/**
 * Starts a checkout.
 *
 * The member's id goes in `client_reference_id` and in metadata, and that is the
 * only thing tying a Stripe customer to a member. Their name and card never
 * touch this process: §9.7 keeps legal names in Stripe, and the way to keep a
 * promise like that is to never be handed the thing in the first place.
 */
export async function startCheckout(
  _previous: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const planId = String(formData.get("plan") ?? "") as PlanId;
  if (!PLANS.some((plan) => plan.id === planId)) return { error: "Choose a plan." };

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const { NEXT_PUBLIC_APP_URL } = parseClientEnv(process.env);

  // Reuse an existing customer where there is one, so a member who subscribes,
  // cancels and returns is one customer in Stripe rather than three.
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id, status, current_period_end")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  /**
   * Refuse a second subscription on top of a live one.
   *
   * The page already hides the chooser from a premium member, and that is
   * presentation — this is the door. A form rendered before subscribing and
   * submitted after, a second tab, or a direct POST all reach here, and the
   * result is two Stripe subscriptions on one customer, both billing, with
   * nothing in the app showing the second.
   *
   * NOT `is_premium()`, deliberately, even though the backlog said so. That
   * function is true for a referral grant as well, and somebody whose grant
   * expires next week has every reason to subscribe now — refusing them would
   * mean waiting for their own reward to lapse before they could pay. The
   * question here is narrower than "are they premium": it is "are they already
   * paying Stripe".
   *
   * The liveness test is the one is_premium uses on the same table, so a row it
   * would count and a row this refuses on are the same rows.
   */
  if (stripeIsLive(existing as StripeRow | null, Date.now())) {
    return { error: C.premiumAlreadySubscribed };
  }

  /**
   * And the same door for a store subscription, which is the likelier one.
   *
   * The order somebody actually does this in: subscribe on the web, install the
   * app, buy again through the App Store because the app never mentioned the
   * first one. This is the reverse trip — an App Store subscriber opening the
   * web app — and without it Stripe starts a second charge on somebody Apple is
   * already billing, with nothing in either place showing the other.
   *
   * The premium page hides the chooser from anybody premium, and that is
   * presentation. This is the door: a form rendered before subscribing and
   * submitted after, a second tab, or a direct POST all arrive here.
   *
   * Still NOT `is_premium()`, for the reason the Stripe check above gives — a
   * referral grant is no reason to refuse somebody a subscription. The question
   * is whether a store is charging them, and a grant never is.
   */
  const { data: entitlements } = await supabase
    .from("iap_entitlements")
    .select("store, product_id, status, expires_at")
    .eq("user_id", auth.user.id);

  const paying = (entitlements ?? []) as EntitlementRow[];
  if (alreadyPayingAStore(paying, Date.now())) {
    const store = paying.some((row) => row.store === "apple") ? "the App Store" : "Google Play";
    return { error: C.premiumAlreadyStoreSubscribed(store) };
  }

  let url: string | null = null;
  try {
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceIdFor(planId), quantity: 1 }],
      client_reference_id: auth.user.id,
      ...(existing?.stripe_customer_id ? { customer: existing.stripe_customer_id as string } : {}),
      // Read back by the webhook. client_reference_id alone is not on every
      // event type, and a subscription that cannot be attributed to a member is
      // a payment we took and cannot honour.
      subscription_data: { metadata: { user_id: auth.user.id, plan: planId } },
      metadata: { user_id: auth.user.id, plan: planId },
      success_url: `${NEXT_PUBLIC_APP_URL}/app/settings/premium?checkout=done`,
      cancel_url: `${NEXT_PUBLIC_APP_URL}/app/settings/premium`,
    });
    url = session.url;
  } catch {
    // Stripe keys are placeholders until Kevin supplies them, so this is the
    // expected path today. It says nothing about the member's card.
    return { error: "Payments are not switched on yet." };
  }

  if (!url) return { error: "Could not start checkout." };
  redirect(url);
}

/**
 * The Stripe billing portal — cancel, change card, see invoices (§7.2).
 *
 * Deliberately not rebuilt here. Stripe's portal is the one place a member's
 * billing details live, and a local cancel screen would mean either copying
 * them or building a second source of truth for whether someone is subscribed.
 */
export async function openBillingPortal(
  _previous: CheckoutState,
  _formData: FormData,
): Promise<CheckoutState> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!subscription?.stripe_customer_id) return { error: "No subscription to manage." };

  const { NEXT_PUBLIC_APP_URL } = parseClientEnv(process.env);

  let url: string | null = null;
  try {
    const session = await stripe().billingPortal.sessions.create({
      customer: subscription.stripe_customer_id as string,
      return_url: `${NEXT_PUBLIC_APP_URL}/app/settings/premium`,
    });
    url = session.url;
  } catch {
    return { error: "Payments are not switched on yet." };
  }

  redirect(url);
}
