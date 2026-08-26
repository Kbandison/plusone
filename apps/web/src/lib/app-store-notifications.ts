import {
  JwsError,
  entitlementStatusOf,
  verifyAppStoreJws,
  verifyAppleJws,
  BUNDLE_ID,
  type AppStoreTransaction,
  type VerifyOptions,
} from "./app-store-jws";

/**
 * What Apple tells us about a subscription after the purchase.
 *
 * `iap-actions.ts` records what a member's device reported at the moment they
 * paid, and that is a snapshot of one instant. Everything afterwards happens
 * with nobody in the app: a monthly renewal, a card that fails, a refund
 * granted by Apple Support, a cancellation from iOS Settings. None of it
 * produces a device call, so without this a member's premium status is frozen
 * at whatever it was the day they bought it — expiring only when the clock
 * catches up, and never being revoked at all.
 *
 * ── the envelope is signed, and so is the thing inside it ───────────────────
 *
 * Apple POSTs `{ signedPayload }`, a JWS whose payload contains
 * `data.signedTransactionInfo` — another JWS. Both chain to the same root, so
 * `verifyAppleJws` runs twice and the transaction is only trusted after the
 * envelope carrying it has been.
 *
 * There is no shared secret and no header to check: the signature IS the
 * authentication. That makes it the whole of the security here, which is why
 * the route refuses anything it cannot verify rather than acknowledging it to
 * make Apple stop retrying.
 */

/** The notification types that change what somebody is entitled to. */
export type NotificationType =
  | "SUBSCRIBED"
  | "DID_RENEW"
  | "DID_CHANGE_RENEWAL_STATUS"
  | "DID_CHANGE_RENEWAL_PREF"
  | "DID_FAIL_TO_RENEW"
  | "EXPIRED"
  | "GRACE_PERIOD_EXPIRED"
  | "REFUND"
  | "REVOKE"
  | "OFFER_REDEEMED"
  | "RENEWAL_EXTENDED"
  | "PRICE_INCREASE"
  | "CONSUMPTION_REQUEST"
  | "REFUND_DECLINED"
  | "REFUND_REVERSED"
  | "TEST";

interface Envelope {
  readonly notificationType: NotificationType;
  readonly subtype?: string;
  readonly notificationUUID?: string;
  readonly data?: {
    readonly bundleId?: string;
    readonly environment?: "Sandbox" | "Production";
    readonly signedTransactionInfo?: string;
    readonly signedRenewalInfo?: string;
  };
}

export interface AppStoreNotification {
  readonly type: NotificationType;
  readonly subtype?: string;
  readonly environment?: "Sandbox" | "Production";
  /** Absent for TEST and for the types that carry no transaction. */
  readonly transaction?: AppStoreTransaction;
}

/**
 * Verifies the envelope, then the transaction inside it.
 *
 * The bundleId lives at `data.bundleId` here rather than at the top level,
 * which is why `verifyAppleJws` was split out of `verifyAppStoreJws`: the
 * transaction check would have looked for a field this shape does not have and
 * rejected every notification Apple sends.
 */
export function verifyAppStoreNotification(
  signedPayload: string,
  { bundleId = BUNDLE_ID, ...rest }: VerifyOptions = {},
): AppStoreNotification {
  const envelope = verifyAppleJws<Envelope>(signedPayload, rest);

  if (!envelope.notificationType) throw new JwsError("notification has no type");

  // TEST carries no data at all, and App Store Connect's "send test
  // notification" button is how anybody first checks this endpoint is wired.
  // Rejecting it for having no bundleId would make the one diagnostic Apple
  // offers report a failure.
  if (envelope.notificationType !== "TEST") {
    if (envelope.data?.bundleId !== bundleId) {
      throw new JwsError(`notification is for ${String(envelope.data?.bundleId)}`);
    }
  }

  const signed = envelope.data?.signedTransactionInfo;
  return {
    type: envelope.notificationType,
    ...(envelope.subtype ? { subtype: envelope.subtype } : {}),
    ...(envelope.data?.environment ? { environment: envelope.data.environment } : {}),
    // Verified in its own right. The envelope being genuine says nothing about
    // a payload nested inside it.
    ...(signed ? { transaction: verifyAppStoreJws(signed, { bundleId, ...rest }) } : {}),
  };
}

/**
 * What a notification means for `iap_entitlements.status`.
 *
 * Mostly the transaction already says it — an expiry has passed, a revocation
 * date is set — and `entitlementStatusOf` reads that. Two cases it cannot:
 *
 *   · GRACE PERIOD. `DID_FAIL_TO_RENEW` with subtype `GRACE_PERIOD` means the
 *     renewal payment failed and Apple is retrying while keeping the member in
 *     service. The transaction still carries the OLD expiry, which has passed,
 *     so reading it alone would lock somebody out over a card their bank
 *     re-authorises an hour later. This is the entire reason `grace` is one of
 *     the five statuses.
 *   · REVOCATION arriving before the transaction shows it. `REFUND` and
 *     `REVOKE` are Apple telling us access ends NOW, weeks before expiresDate.
 *     Trusting the clock here is the failure iap_entitlements was shaped
 *     around.
 *
 * Anything else — a price increase, a consumption request, a renewal preference
 * change for NEXT term — leaves the current entitlement exactly as it is, and
 * returning null says so rather than writing an unchanged row.
 */
export function statusFromNotification(
  notification: AppStoreNotification,
  now: number,
): "active" | "grace" | "expired" | "revoked" | null {
  const { type, subtype, transaction } = notification;
  if (!transaction) return null;

  switch (type) {
    case "REFUND":
    case "REVOKE":
      return "revoked";

    case "DID_FAIL_TO_RENEW":
      // With GRACE_PERIOD they are still in service; without it, the retry
      // window is over or was never offered.
      return subtype === "GRACE_PERIOD" ? "grace" : entitlementStatusOf(transaction, now);

    case "GRACE_PERIOD_EXPIRED":
      return "expired";

    case "EXPIRED":
      return "expired";

    case "SUBSCRIBED":
    case "DID_RENEW":
    case "OFFER_REDEEMED":
    case "RENEWAL_EXTENDED":
    case "DID_CHANGE_RENEWAL_PREF":
      // The new expiry is in the transaction. Reading it rather than assuming
      // "renewed means active" keeps a replayed notification from extending
      // anybody — same rule as the Stripe webhook's current_period_end.
      return entitlementStatusOf(transaction, now);

    case "REFUND_REVERSED":
      // Apple took a refund back. Whether that restores access depends on the
      // dates, which the transaction carries.
      return entitlementStatusOf(transaction, now);

    // Auto-renew switched off is NOT a loss of access — the member keeps what
    // they paid for until it runs out, and treating it as cancellation would
    // take away a month somebody has already bought. The same goes for a price
    // increase, a consumption request and a declined refund: all of them are
    // news, none of them changes today's entitlement.
    case "DID_CHANGE_RENEWAL_STATUS":
    case "PRICE_INCREASE":
    case "CONSUMPTION_REQUEST":
    case "REFUND_DECLINED":
    case "TEST":
    default:
      return null;
  }
}
