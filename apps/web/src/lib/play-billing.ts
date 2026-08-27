import "server-only";

import { BUNDLE_ID } from "./app-store-jws";
import { googleAccessToken } from "./google-auth";

/**
 * What Google says about a purchase, since the purchase itself says nothing.
 *
 * This is the half that differs most from Apple. A StoreKit transaction arrives
 * as a JWS — Apple's own signed statement — so `app-store-jws.ts` can verify it
 * offline against an embedded root and never ask Apple anything. Play hands the
 * client an opaque `purchaseToken` and no signature at all. There is nothing in
 * it to check. The only way to know whether it is real, what it bought, and
 * whether it is still paid for is to present it to the Play Developer API.
 *
 * Which is why Android needed a Google Cloud service account and iOS needed
 * nothing: the credential is not an optional convenience here, it IS the
 * verification.
 *
 * The token reaching us is therefore not evidence of anything on its own. A
 * member could send somebody else's. What stops that is the same thing that
 * stops it on Apple's side — `record_iap_entitlement`'s unique key binds a
 * subscription to the first member it is recorded against and refuses to move
 * it afterwards.
 */

/** Play's seven states, from the SubscriptionPurchaseV2 reference. */
type SubscriptionState =
  | "SUBSCRIPTION_STATE_UNSPECIFIED"
  | "SUBSCRIPTION_STATE_PENDING"
  | "SUBSCRIPTION_STATE_ACTIVE"
  | "SUBSCRIPTION_STATE_PAUSED"
  | "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"
  | "SUBSCRIPTION_STATE_ON_HOLD"
  | "SUBSCRIPTION_STATE_CANCELED"
  | "SUBSCRIPTION_STATE_EXPIRED";

interface SubscriptionPurchaseV2 {
  readonly subscriptionState?: SubscriptionState;
  readonly lineItems?: readonly {
    readonly productId?: string;
    readonly expiryTime?: string;
  }[];
  readonly linkedPurchaseToken?: string;
  readonly testPurchase?: Record<string, unknown>;
  readonly externalAccountIdentifiers?: {
    readonly obfuscatedExternalAccountId?: string;
  };
}

export interface PlayPurchase {
  readonly productId: string;
  /** Null only if Play returned no expiry, which a subscription always has. */
  readonly expiresAt: string | null;
  readonly status: "active" | "grace" | "paused" | "expired";
  /**
   * The token this one REPLACED, on an upgrade or downgrade.
   *
   * Play issues a fresh purchase token for a cross-product change and points at
   * the old one here. That is why `iap_entitlements.transaction_id` holds the
   * token rather than something stable: the new subscription is genuinely a new
   * row, and this is the only thread back to the one it supersedes.
   */
  readonly replaces: string | null;
  /** Set by the client at purchase, when the client sets it. See the action. */
  readonly accountId: string | null;
  readonly isTest: boolean;
}

export class PlayVerifyError extends Error {}

/**
 * Play's state, mapped onto the four `iap_entitlements` understands.
 *
 * Two of the seven are traps, and they are the same two shapes Apple has:
 *
 *   CANCELED does NOT mean access ended. It means auto-renew is off, and the
 *   member keeps what they paid for until `expiryTime`. Treating it as expired
 *   takes away a month somebody has already bought — the same mistake
 *   `DID_CHANGE_RENEWAL_STATUS` invites on the Apple side.
 *
 *   IN_GRACE_PERIOD carries a PASSED expiry, because the renewal payment failed
 *   and Play is retrying while keeping the member in service. Letting the clock
 *   decide would lock somebody out over a card their bank re-authorises an hour
 *   later. That is what the `grace` status exists for.
 *
 * Everything unrecognised falls through to `expired`, which is the safe
 * direction: a state we do not understand must not grant.
 */
export function playStatusOf(
  state: SubscriptionState | undefined,
  expiryMs: number | null,
  now: number,
): PlayPurchase["status"] {
  switch (state) {
    case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD":
      return "grace";
    case "SUBSCRIPTION_STATE_PAUSED":
      return "paused";
    case "SUBSCRIPTION_STATE_ACTIVE":
    case "SUBSCRIPTION_STATE_CANCELED":
      // Cancelled but still paid for. The clock decides, not the flag.
      return expiryMs !== null && expiryMs > now ? "active" : "expired";
    // ON_HOLD is grace exhausted — Play has stopped retrying and access ends.
    // PENDING was never paid for at all.
    default:
      return "expired";
  }
}

/**
 * Asks Google what a purchase token is worth.
 *
 * Throws rather than returning null on a refusal, so a caller cannot mistake
 * "Google said no" for "no subscription" — one is a reason to refuse a grant
 * and the other is a reason to retry.
 */
export async function verifyPlayPurchase(
  purchaseToken: string,
  { now = Date.now(), packageName = BUNDLE_ID }: { now?: number; packageName?: string } = {},
): Promise<PlayPurchase> {
  const token = await googleAccessToken();
  if (!token) throw new PlayVerifyError("google auth unavailable");

  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/` +
    `${encodeURIComponent(purchaseToken)}`;

  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) {
    // A 404 is a token Play does not recognise — a forgery, or one from another
    // app. Reported by status only: the body echoes the token back.
    throw new PlayVerifyError(`play refused the token (${response.status})`);
  }

  const purchase = (await response.json()) as SubscriptionPurchaseV2;

  // One line item is the shape a subscription takes; more would mean something
  // this app does not sell, and picking one arbitrarily would be a guess.
  const line = purchase.lineItems?.[0];
  if (!line?.productId) throw new PlayVerifyError("purchase names no product");

  const expiryMs = line.expiryTime ? Date.parse(line.expiryTime) : null;

  return {
    productId: line.productId,
    expiresAt:
      expiryMs !== null && Number.isFinite(expiryMs) ? new Date(expiryMs).toISOString() : null,
    status: playStatusOf(purchase.subscriptionState, expiryMs, now),
    replaces: purchase.linkedPurchaseToken ?? null,
    accountId: purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
    // Play marks a licence-tester purchase. Recorded rather than refused: the
    // whole Android path has to be exercisable before it is exercised for real,
    // and `environment` is the column that says which a row came from.
    isTest: Boolean(purchase.testPurchase),
  };
}
