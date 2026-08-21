"use server";

import { redirect } from "next/navigation";

import { PLANS, parseClientEnv, type PlanId } from "@plusone/config";

import { priceIdFor, stripe } from "@/lib/stripe";
import { getServerSupabase } from "@/lib/supabase";
import type { CheckoutState } from "./state";

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
    .select("stripe_customer_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

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
