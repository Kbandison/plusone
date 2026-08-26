/**
 * Who took the money, and therefore who can stop taking it.
 *
 * A subscription can now come from three places, and only one of them is ours
 * to cancel. Stripe has a billing portal we open. Apple and Google will not let
 * anyone else end a subscription they sold — not us, not each other — so the
 * only honest thing a premium screen can do is send the member to the right
 * store, and sending them to the wrong one is a dead end with no error.
 *
 * That makes this a routing problem rather than a display one, and it is the
 * reason `iap_entitlements` records `store` at all.
 */
import { BUNDLE_ID } from "./app-store-jws";

export type SubscriptionSource = "stripe" | "apple" | "google";

/**
 * Apple's own subscription management, and the only address for it.
 *
 * On an iPhone this opens Settings rather than a web page, which is exactly
 * what is wanted — and it is also why this link is safe inside the shell where
 * a Stripe checkout is not. Guideline 3.1.1 forbids selling outside IAP;
 * managing an IAP subscription through Apple's own screen is what Apple asks
 * for.
 */
export const APPLE_MANAGE_URL = "https://apps.apple.com/account/subscriptions";

/**
 * Play's equivalent, which needs to be told which subscription it is.
 *
 * Without `sku` and `package` it lands on a list of every subscription the
 * member has across every app, which is a worse answer than no link at all for
 * somebody who is trying to cancel one thing.
 */
export function googleManageUrl(productId: string): string {
  const params = new URLSearchParams({ sku: productId, package: BUNDLE_ID });
  return `https://play.google.com/store/account/subscriptions?${params.toString()}`;
}

/** One row of `iap_entitlements`, as the premium page selects it. */
export interface EntitlementRow {
  readonly store: string;
  readonly product_id: string;
  readonly status: string;
  readonly expires_at: string | null;
}

/**
 * Is this row buying anything right now.
 *
 * The same test `is_premium()` makes in SQL, deliberately: a row the gate counts
 * and a row this screen offers to manage must be the same rows, or a member is
 * told they are premium by one and shown nothing to cancel by the other.
 *
 * Status before the clock, for the reason the schema gives — a refund revokes
 * access now and leaves `expires_at` weeks out.
 */
export function isLive(row: EntitlementRow, now: number): boolean {
  if (row.status !== "active" && row.status !== "grace") return false;
  return Boolean(row.expires_at) && Date.parse(row.expires_at!) > now;
}

export interface LiveSource {
  readonly source: SubscriptionSource;
  readonly productId?: string;
  readonly manageUrl?: string;
}

/**
 * Every source currently charging this member, in the order a screen should
 * show them.
 *
 * Plural on purpose. The tidy assumption is that there is one, and the case
 * this exists for is the one where there is not: somebody subscribes on the
 * web, installs the app, and buys again through the App Store. They are then
 * paying twice, in two places, and each has to be cancelled where it was
 * bought. A screen that picks a single "the" subscription hides one of the two
 * charges from the person paying it.
 *
 * Stripe first because it is the one we can actually cancel on their behalf.
 */
export function liveSources(
  stripeIsLive: boolean,
  entitlements: readonly EntitlementRow[],
  now: number,
): LiveSource[] {
  const out: LiveSource[] = [];
  if (stripeIsLive) out.push({ source: "stripe" });

  for (const row of entitlements) {
    if (!isLive(row, now)) continue;
    if (row.store === "apple") {
      out.push({ source: "apple", productId: row.product_id, manageUrl: APPLE_MANAGE_URL });
    } else if (row.store === "google") {
      out.push({
        source: "google",
        productId: row.product_id,
        manageUrl: googleManageUrl(row.product_id),
      });
    }
  }
  return out;
}

/**
 * The narrow question `startCheckout` asks before taking money.
 *
 * NOT `is_premium()`, for the reason actions.ts already gives about Stripe: a
 * referral grant makes somebody premium and is no reason to refuse them a
 * subscription — they would have to wait for their own reward to lapse before
 * they could pay. The question is "are they already being charged by a store",
 * which a grant never is.
 */
export function alreadyPayingAStore(entitlements: readonly EntitlementRow[], now: number): boolean {
  return entitlements.some((row) => isLive(row, now));
}
