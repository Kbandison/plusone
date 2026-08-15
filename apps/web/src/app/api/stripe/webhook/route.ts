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
      const customerId = typeof session.customer === "string" ? session.customer : null;

      // Without a member this payment cannot be honoured. Acknowledged so
      // Stripe stops retrying, and logged so somebody notices.
      if (!userId || !customerId) {
        console.error(JSON.stringify({ at: "stripe.webhook", event: event.type, problem: "unattributable" }));
        return NextResponse.json({ received: true });
      }

      await supabase.from("subscriptions").upsert(
        {
          user_id: userId,
          stripe_customer_id: customerId,
          status: "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      return NextResponse.json({ received: true });
    }

    const subscription = event.data.object as Stripe.Subscription;
    const userId = subscription.metadata?.["user_id"];
    const customerId =
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

    if (!userId) {
      console.error(JSON.stringify({ at: "stripe.webhook", event: event.type, problem: "no user_id in metadata" }));
      return NextResponse.json({ received: true });
    }

    const item = subscription.items.data[0];
    const priceId = item?.price?.id ?? null;
    // The period end comes from Stripe, never from now() — replaying a
    // three-month-old event must not push anybody's access three months out.
    const periodEnd = item?.current_period_end
      ? new Date(item.current_period_end * 1000).toISOString()
      : null;

    await supabase.from("subscriptions").upsert(
      {
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_sub_id: subscription.id,
        plan: priceId ? planIdForPrice(priceId) : null,
        // Stripe's own status, verbatim. is_premium() decides what counts as
        // paying; translating it here would be a second opinion.
        status: event.type === "customer.subscription.deleted" ? "canceled" : subscription.status,
        current_period_end: periodEnd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    return NextResponse.json({ received: true });
  } catch (error) {
    // A 500 asks Stripe to retry, which is right: the event was genuine and we
    // failed to record it.
    console.error(JSON.stringify({ at: "stripe.webhook", event: event.type, error: String(error) }));
    return NextResponse.json({ error: "could not record" }, { status: 500 });
  }
}
