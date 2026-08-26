import { NextResponse } from "next/server";

import { verifyAppStoreNotification, statusFromNotification } from "@/lib/app-store-notifications";
import { serviceClient } from "@/lib/cron";

export const dynamic = "force-dynamic";

/**
 * App Store Server Notifications V2 (server lane 4).
 *
 * Everything that happens to a subscription after the purchase happens with
 * nobody in the app — a renewal, a failed card, a refund, a cancellation from
 * iOS Settings. `iap-actions.ts` records one instant; this is what keeps the
 * record true afterwards. Without it a member's entitlement only ever expires
 * by the clock and can never be revoked.
 *
 * Set in App Store Connect under the app's General → App Information →
 * "App Store Server Notifications", Production and Sandbox URLs separately.
 *
 * ── the signature is the authentication ────────────────────────────────────
 *
 * There is no shared secret here and no header to compare, unlike the Stripe
 * webhook. Apple signs the body, so verifying it IS the check — and a body that
 * does not verify is a stranger telling us somebody's subscription was renewed.
 * It is refused rather than acknowledged.
 *
 * That is the opposite of the rule for a notification we simply do not handle,
 * which is acknowledged: returning an error for a type we have no opinion about
 * teaches Apple to retry it for days.
 *
 * ── what it does NOT do ────────────────────────────────────────────────────
 *
 * It never creates an entitlement, only updates one. A notification identifies
 * a subscription by originalTransactionId and carries no appAccountToken on
 * every type, so a row that does not exist yet cannot be bound to a member —
 * and inventing that binding is precisely the failure the schema's unique key
 * and its trigger exist to prevent. If the row is missing, the purchase never
 * reached `submitAppStoreTransaction`, and StoreKit will redeliver it to the
 * device where it can be bound properly.
 */
export async function POST(request: Request) {
  let signedPayload: string | undefined;
  try {
    const body = (await request.json()) as { signedPayload?: string };
    signedPayload = body.signedPayload;
  } catch {
    return NextResponse.json({ error: "unreadable" }, { status: 400 });
  }
  if (!signedPayload) return NextResponse.json({ error: "no payload" }, { status: 400 });

  let notification;
  try {
    notification = verifyAppStoreNotification(signedPayload);
  } catch (cause) {
    // §9.6 — the reason, never the payload, which is a receipt.
    console.error(
      JSON.stringify({
        at: "appstore.notify.verify",
        problem: cause instanceof Error ? cause.message : "unknown",
      }),
    );
    return NextResponse.json({ error: "unverified" }, { status: 400 });
  }

  const status = statusFromNotification(notification, Date.now());

  // Acknowledged, not errored. TEST arrives from App Store Connect's own button
  // and is how anybody first confirms this URL is reachable; the rest are types
  // that genuinely change nothing about today's entitlement.
  if (!status || !notification.transaction) {
    console.info(
      JSON.stringify({ at: "appstore.notify", type: notification.type, applied: false }),
    );
    return NextResponse.json({ ok: true });
  }

  const transaction = notification.transaction;
  const supabase = serviceClient();

  /**
   * Update, never insert, and never touch user_id.
   *
   * The binding to a member is made once at purchase and is immutable — the
   * trigger from 20260826000100 refuses to move it. Matching on
   * (store, transaction_id) means a notification for a subscription we have
   * never seen updates nothing, which is the correct outcome: there is nobody
   * to grant it to.
   */
  const { data, error } = await supabase
    .from("iap_entitlements")
    .update({
      status,
      product_id: transaction.productId,
      // Apple's date, never a clock. A replayed notification must not be able
      // to extend anybody — the same rule the Stripe webhook follows.
      expires_at: transaction.expiresDate ? new Date(transaction.expiresDate).toISOString() : null,
      ...(notification.environment ? { environment: notification.environment } : {}),
    })
    .eq("store", "apple")
    .eq("transaction_id", transaction.originalTransactionId)
    .select("id");

  if (error) {
    console.error(
      JSON.stringify({
        at: "appstore.notify.record",
        type: notification.type,
        problem: error.message,
      }),
    );
    // A 500 so Apple retries. This is the one failure worth retrying: the
    // notification was genuine and we could not write it down.
    return NextResponse.json({ error: "not recorded" }, { status: 500 });
  }

  // A count, never an id. Zero means the purchase never reached the server
  // action, and StoreKit's redelivery is what fixes that rather than anything
  // here.
  console.info(
    JSON.stringify({
      at: "appstore.notify",
      type: notification.type,
      ...(notification.subtype ? { subtype: notification.subtype } : {}),
      status,
      rows: data?.length ?? 0,
    }),
  );

  return NextResponse.json({ ok: true });
}
