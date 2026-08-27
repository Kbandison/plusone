import "server-only";

import { OAuth2Client } from "google-auth-library";

import { BUNDLE_ID } from "./app-store-jws";

/**
 * What Play tells us happened, which is almost nothing.
 *
 * The contrast with Apple is the whole design. An App Store Server Notification
 * carries a signed transaction inside it, so `app-store-notifications.ts` reads
 * the new state straight out of the envelope and never asks Apple anything.
 * Play's carries a purchase token and an integer, and Google says plainly what
 * that means: "These notifications tell you only that the purchase state
 * changed. They do not give you complete information about the purchase."
 *
 * So this is a HINT TO RE-CHECK rather than a statement of fact, and the
 * handler treats it that way. `notificationType` is deliberately not mapped
 * onto a status — there is no point deciding what type 5 means when the next
 * line asks Google for the truth. The one exception is a voided purchase, which
 * is the case where the notification knows something the subscription lookup
 * may not: money was given back.
 *
 * That also makes the endpoint far less dangerous than it looks. A forged
 * notification cannot assert anything; the worst it achieves is making us ask
 * Google about a token, and Google answers with the truth either way.
 */

/** The Pub/Sub push envelope. `data` is the base64 DeveloperNotification. */
interface PushEnvelope {
  readonly message?: {
    readonly data?: string;
    readonly messageId?: string;
    readonly publishTime?: string;
  };
  readonly subscription?: string;
}

interface DeveloperNotification {
  readonly version?: string;
  readonly packageName?: string;
  readonly eventTimeMillis?: string;
  readonly subscriptionNotification?: {
    readonly notificationType?: number;
    readonly purchaseToken?: string;
  };
  readonly voidedPurchaseNotification?: {
    readonly purchaseToken?: string;
    readonly productType?: number;
  };
  readonly oneTimeProductNotification?: { readonly purchaseToken?: string };
  readonly testNotification?: { readonly version?: string };
}

export type PlayNotification =
  /** App Store Connect's button equivalent — proves the wiring, changes nothing. */
  | { readonly kind: "test" }
  /** Something happened to a subscription. Ask Google what. */
  | { readonly kind: "subscription"; readonly purchaseToken: string; readonly type: number | null }
  /** Money was returned. The one case the notification knows more than the lookup. */
  | { readonly kind: "voided"; readonly purchaseToken: string }
  /** A shape this app does not sell, or one Google adds later. */
  | { readonly kind: "ignored"; readonly why: string };

export class PlayNotificationError extends Error {}

/**
 * Unwraps the Pub/Sub envelope and says what kind of thing arrived.
 *
 * Refuses a notification for another package, for the same reason the Apple
 * side checks bundleId: this endpoint is public, and "signed by Google" and
 * "about our app" are different claims.
 */
export function readPlayNotification(
  body: unknown,
  { packageName = BUNDLE_ID }: { packageName?: string } = {},
): PlayNotification {
  const envelope = body as PushEnvelope;
  const data = envelope?.message?.data;
  if (!data) throw new PlayNotificationError("no message data");

  let notification: DeveloperNotification;
  try {
    notification = JSON.parse(
      Buffer.from(data, "base64").toString("utf8"),
    ) as DeveloperNotification;
  } catch {
    throw new PlayNotificationError("message data is not json");
  }

  // A test notification carries no packageName in some deliveries, so the
  // package check comes after it — the same order the Apple handler uses, and
  // for the same reason: the one diagnostic a console offers must not be the
  // thing that fails.
  if (notification.testNotification) return { kind: "test" };

  if (notification.packageName && notification.packageName !== packageName) {
    throw new PlayNotificationError(`notification is for ${notification.packageName}`);
  }

  const voided = notification.voidedPurchaseNotification?.purchaseToken;
  if (voided) return { kind: "voided", purchaseToken: voided };

  const sub = notification.subscriptionNotification;
  if (sub?.purchaseToken) {
    return {
      kind: "subscription",
      purchaseToken: sub.purchaseToken,
      type: sub.notificationType ?? null,
    };
  }

  if (notification.oneTimeProductNotification) {
    return { kind: "ignored", why: "one-time product, which this app does not sell" };
  }
  return { kind: "ignored", why: "no recognised notification body" };
}

/**
 * That the caller really is our Pub/Sub subscription.
 *
 * Pub/Sub push can attach an OIDC token identifying a service account, and this
 * checks it — signature, audience, and the account it names. Reusing
 * `GCP_SERVICE_ACCOUNT_EMAIL` rather than adding a variable is deliberate: it
 * is the same identity already used to read the subscription, so there is one
 * account to configure and one to revoke.
 *
 * Worth being clear about what this does and does not buy. It is NOT what makes
 * the entitlement safe — nothing in the payload is trusted, and every purchase
 * token is re-verified with Google before a row moves. What it buys is that a
 * stranger cannot make this endpoint do unbounded work on their behalf.
 */
export async function verifyPushCaller(
  authorization: string | null,
  expectedAudience: string,
): Promise<void> {
  const email = process.env["GCP_SERVICE_ACCOUNT_EMAIL"];
  if (!email) throw new PlayNotificationError("no service account configured");

  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) throw new PlayNotificationError("no bearer token");

  let payload;
  try {
    const ticket = await new OAuth2Client().verifyIdToken({
      idToken: token,
      audience: expectedAudience,
    });
    payload = ticket.getPayload();
  } catch {
    // Includes an expired token, a wrong audience, and a signature that is not
    // Google's. None of them is worth distinguishing to a caller.
    throw new PlayNotificationError("token did not verify");
  }

  if (payload?.email !== email || payload?.email_verified !== true) {
    throw new PlayNotificationError("token names another account");
  }
}
