import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { parseServerEnv } from "@plusone/config";

import { serviceClient } from "@/lib/cron";
import { planIdForPrice, stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * The Stripe webhook (§2 Decision #22).
 *
 * Three things this gets right on purpose:
 *
 *   1. THE SIGNATURE IS VERIFIED BEFORE ANYTHING IS READ. This endpoint is
 *      public by necessity, and the body is the only thing telling us somebody
 *      paid. An unverified body is a stranger's claim that they are premium.
 *      The raw text is used — parsing first would break the signature.
 *
 *   2. IT IS IDEMPOTENT. Stripe retries on any non-2xx and will happily deliver
 *      the same event twice on a good day. Every write is an upsert keyed on
 *      the member, and `current_period_end` comes from the event rather than
 *      from a clock, so replaying an old event cannot extend anybody's
 *      subscription.
 *
 *   3. IT NEVER STORES A NAME. §9.7 — Stripe holds legal names and our database
 *      does not. What lands here is a customer id, a subscription id, a status
 *      and a period end. The `subscriptions` table has no column for anything
 *      else, which is the real guarantee.
 *
 * An unrecognised event is acknowledged rather than rejected. Returning an error
 * for an event we do not handle teaches Stripe to retry it forever.
 */

const HANDLED = new Set<Stripe.Event.Type>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

/**
 * Writes a subscription row from Stripe's own object.
 *
 * Both branches go through this, and they did not used to. The checkout branch
 * wrote `status: 'active'` with no `current_period_end` — which is_premium()
 * reads as premium with no expiry, because the null arm of that check exists
 * for §6.5 referral grants. customer.subscription.created corrected it a second
 * later, so it was invisible in testing; if that event is not subscribed, or
 * its delivery permanently fails, the correction never arrives and the member
 * is premium forever with nothing left to revoke it.
 *
 * The period end still comes from Stripe and never from a clock, so replaying
 * an old event cannot extend anybody's access.
 */
async function recordSubscription(
  supabase: ReturnType<typeof serviceClient>,
  subscription: Stripe.Subscription,
  userId: string,
  status: string,
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const item = subscription.items.data[0];
  const priceId = item?.price?.id ?? null;

  const { error } = await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_sub_id: subscription.id,
      plan: priceId ? planIdForPrice(priceId) : null,
      status,
      current_period_end: item?.current_period_end
        ? new Date(item.current_period_end * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  // supabase-js RESOLVES on failure rather than rejecting — PostgrestBuilder is
  // typed ThrowOnError=false, and its runtime converts fetch errors, aborts and
  // HTTP errors into a resolved { data: null, error }. So discarding this value
  // meant a failed write fell through to `{ received: true }` with a 200, and
  // Stripe never retried: a real payment taken, nothing recorded, and no
  // signal anywhere. The catch below is what turns this into the 500 that asks
  // Stripe to try again.
  if (error) throw error;
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "unsigned" }, { status: 400 });

  const { STRIPE_WEBHOOK_SECRET } = parseServerEnv(process.env);
  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(raw, signature, STRIPE_WEBHOOK_SECRET);
  } catch {
    // No detail in the response. A verification error that explains itself is a
    // forgery oracle.
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  if (!HANDLED.has(event.type)) return NextResponse.json({ received: true });

  const supabase = serviceClient();

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.client_reference_id ?? session.metadata?.["user_id"];

      // Without a member this payment cannot be honoured. Acknowledged so
      // Stripe stops retrying, and logged so somebody notices.
      //
      // The session's customer id is deliberately NOT checked: the row takes it
      // from the subscription, which always carries one, so refusing here on a
      // field nothing reads would drop a real payment over nothing.
      if (!userId) {
        console.error(
          JSON.stringify({
            at: "stripe.webhook",
            event: event.type,
            problem: "unattributable",
          }),
        );
        return NextResponse.json({ received: true });
      }

      // The session carries a subscription id but no period end, so the
      // subscription itself is fetched rather than assumed. One extra call, and
      // in exchange this event alone is enough to record a correct row — the
      // handler no longer depends on customer.subscription.created arriving to
      // put a bound on what was just bought.
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription?.id ?? null);

      if (!subscriptionId) {
        // mode: 'subscription' always produces one. If it is ever absent, the
        // safe thing is to record nothing: a row with no period end is a
        // subscription that never expires.
        console.error(
          JSON.stringify({
            at: "stripe.webhook",
            event: event.type,
            problem: "no subscription on session",
          }),
        );
        return NextResponse.json({ received: true });
      }

      // A failure here throws to the 500 below, which asks Stripe to retry —
      // right, because the payment was real and we failed to record it.
      const subscription = await stripe().subscriptions.retrieve(subscriptionId);
      await recordSubscription(supabase, subscription, userId, subscription.status);

      return NextResponse.json({ received: true });
    }

    const subscription = event.data.object as Stripe.Subscription;
    const userId = subscription.metadata?.["user_id"];

    if (!userId) {
      console.error(
        JSON.stringify({
          at: "stripe.webhook",
          event: event.type,
          problem: "no user_id in metadata",
        }),
      );
      return NextResponse.json({ received: true });
    }

    // Stripe's own status, verbatim. is_premium() decides what counts as
    // paying; translating it here would be a second opinion.
    await recordSubscription(
      supabase,
      subscription,
      userId,
      event.type === "customer.subscription.deleted" ? "canceled" : subscription.status,
    );

    return NextResponse.json({ received: true });
  } catch (error) {
    // A 500 asks Stripe to retry, which is right: the event was genuine and we
    // failed to record it.
    console.error(
      JSON.stringify({
        at: "stripe.webhook",
        event: event.type,
        error: String(error),
      }),
    );
    return NextResponse.json({ error: "could not record" }, { status: 500 });
  }
}
