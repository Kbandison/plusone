import { NextResponse } from "next/server";

import { parseClientEnv } from "@plusone/config";

import { serviceClient } from "@/lib/cron";
import { PlayVerifyError, verifyPlayPurchase } from "@/lib/play-billing";
import {
  PlayNotificationError,
  readPlayNotification,
  verifyPushCaller,
} from "@/lib/play-notifications";

export const dynamic = "force-dynamic";

/**
 * Play's Real-time Developer Notifications (server lane 4's other half).
 *
 * Everything after the purchase happens with nobody in the app — a renewal, a
 * failed card, a refund, a cancellation from the Play subscriptions screen.
 * Without this an Android entitlement is frozen at the moment it was bought.
 *
 * Reaches us as a Pub/Sub PUSH: Google POSTs the message here rather than us
 * polling, which is the only shape that suits a serverless function. Point the
 * `play-rtdn-sub` subscription at this URL and give it an OIDC token from the
 * same service account everything else uses.
 *
 * ── it does the opposite of the Apple handler, on purpose ───────────────────
 *
 * `/api/app-store/notifications` verifies a signature and then READS the new
 * state out of the payload, because Apple signs a transaction into it. Play
 * sends a purchase token and an integer, and Google says so explicitly: the
 * notification tells you the state changed, not what it changed to.
 *
 * So this one throws the payload's opinion away and asks the Developer API.
 * `notificationType` is never mapped onto a status — there is no sense deciding
 * what type 5 means when the next call fetches the truth. That also makes a
 * forged notification harmless: it cannot assert anything, only cause a lookup
 * whose answer comes from Google either way.
 *
 * The exception is a VOIDED purchase, which is the one case the notification
 * knows something the lookup may not — money was given back — and which is
 * recorded as `revoked` directly.
 */
export async function POST(request: Request) {
  const { NEXT_PUBLIC_APP_URL } = parseClientEnv(process.env);

  // Pub/Sub signs its OIDC token for the push endpoint URL unless an audience
  // is configured, so the canonical URL is what to expect.
  try {
    await verifyPushCaller(
      request.headers.get("authorization"),
      `${NEXT_PUBLIC_APP_URL}/api/play/notifications`,
    );
  } catch (cause) {
    console.error(
      JSON.stringify({
        at: "play.notify.caller",
        problem: cause instanceof PlayNotificationError ? cause.message : "unknown",
      }),
    );
    // 401 rather than 200. Pub/Sub retries, which is right — an unverifiable
    // caller today may be a misconfiguration fixed in a minute.
    return NextResponse.json({ error: "unverified" }, { status: 401 });
  }

  let notification;
  try {
    notification = readPlayNotification(await request.json());
  } catch (cause) {
    console.error(
      JSON.stringify({
        at: "play.notify.read",
        problem: cause instanceof PlayNotificationError ? cause.message : "unknown",
      }),
    );
    // 400 and no retry. A message we cannot parse will not parse next time
    // either, and Pub/Sub redelivering it forever helps nobody.
    return NextResponse.json({ error: "unreadable" }, { status: 400 });
  }

  // Acknowledged and done. `test` is Play Console's own button and is how
  // anybody first confirms this URL is reachable, so it must succeed.
  if (notification.kind === "test" || notification.kind === "ignored") {
    console.info(
      JSON.stringify({
        at: "play.notify",
        kind: notification.kind,
        ...(notification.kind === "ignored" ? { why: notification.why } : {}),
      }),
    );
    return NextResponse.json({ ok: true });
  }

  const supabase = serviceClient();

  /**
   * A refund ends access NOW, whatever the term says.
   *
   * Recorded without a lookup because this is the one thing the notification
   * knows better: `subscriptionsv2` may still describe a voided purchase as
   * cancelled-with-time-remaining, and paying that out is the failure
   * `iap_entitlements`'s status-before-clock rule exists to prevent.
   */
  const update =
    notification.kind === "voided"
      ? { status: "revoked" as const }
      : await (async () => {
          try {
            const purchase = await verifyPlayPurchase(notification.purchaseToken);
            return {
              status: purchase.status,
              product_id: purchase.productId,
              // Google's date, never a clock, so a replayed notification cannot
              // extend anybody — the same rule both other webhooks follow.
              expires_at: purchase.expiresAt,
            };
          } catch (cause) {
            console.error(
              JSON.stringify({
                at: "play.notify.verify",
                problem: cause instanceof PlayVerifyError ? cause.message : "unknown",
              }),
            );
            return null;
          }
        })();

  if (!update) {
    // A 500 so Pub/Sub retries. This is the failure worth retrying: the
    // notification was genuine and we could not find out what it meant.
    return NextResponse.json({ error: "not verified" }, { status: 500 });
  }

  /**
   * Update, never insert — the same rule the Apple handler follows.
   *
   * A notification identifies a subscription, not a member. Creating a row here
   * would mean inventing the binding that `record_iap_entitlement` exists to
   * protect. A purchase we have never seen updates nothing, which is correct:
   * it never reached the purchase action, and the client resubmitting it is the
   * recovery.
   */
  const { data, error } = await supabase
    .from("iap_entitlements")
    .update(update)
    .eq("store", "google")
    .eq("transaction_id", notification.purchaseToken)
    .select("id");

  if (error) {
    console.error(JSON.stringify({ at: "play.notify.record", problem: error.message }));
    return NextResponse.json({ error: "not recorded" }, { status: 500 });
  }

  // A count, never the token. §9.6 — it identifies one person's purchase.
  console.info(
    JSON.stringify({
      at: "play.notify",
      kind: notification.kind,
      status: update.status,
      rows: data?.length ?? 0,
    }),
  );
  return NextResponse.json({ ok: true });
}
