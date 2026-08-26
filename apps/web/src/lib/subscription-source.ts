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
 *
 * Which statuses count is `statusGrants`, and it is separate because something
 * that has no row to hand still needs to ask. `iap-actions.ts` reported
 * `premium: status === "active"` — correct only because `entitlementStatusOf`
 * cannot currently return `grace`, and silently wrong for a member in a billing
 * grace period the day it can.
 */
export function statusGrants(status: string): boolean {
  // `grace` is the one that is not obvious: the renewal payment failed and the
  // store is retrying while keeping the member in service, so the row carries a
  // PASSED expiry and still buys something. `paused`, `expired` and `revoked`
  // buy nothing, and `revoked` buys nothing even with weeks left on the clock.
  return status === "active" || status === "grace";
}

export function isLive(row: EntitlementRow, now: number): boolean {
  if (!statusGrants(row.status)) return false;
  return Boolean(row.expires_at) && Date.parse(row.expires_at!) > now;
}

/** One row of `subscriptions`, as both callers select it. */
export interface StripeRow {
  readonly status: string | null;
  readonly current_period_end: string | null;
}

/**
 * Is Stripe charging this member right now.
 *
 * One implementation because there were two, and they disagreed. The premium
 * page read `Boolean(end) && Date.parse(end) > now`; `startCheckout` read
 * `!end || Date.parse(end) > now`. Same question, opposite answers when the
 * period end is null — one would have offered a plan chooser while the other
 * refused the purchase behind it.
 *
 * Unreachable today: `subscriptions_paid_status_has_an_end` (20260816000100)
 * forbids an active or trialing row without an end, which is why nobody
 * noticed. Unreachable is not the same as harmless — the constraint is one
 * migration away from not existing, and by then the two readings would be in
 * three places, since the shell's purchase guard now takes this as a prop.
 *
 * The surviving semantic is `is_premium()`'s, verbatim:
 *
 *   status in ('active','trialing')
 *   and (current_period_end is null or current_period_end > now())
 *
 * Deliberately, and for the same reason `isLive` matches it below: a row the
 * gate counts and a row this screen offers to manage must be the same rows. It
 * also fails in the safe direction if the constraint ever goes — treating a
 * null end as live refuses a second subscription, where the other reading sells
 * one to somebody already being charged.
 */
export function stripeIsLive(row: StripeRow | null | undefined, now: number): boolean {
  if (!row) return false;
  if (row.status !== "active" && row.status !== "trialing") return false;
  return !row.current_period_end || Date.parse(row.current_period_end) > now;
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
  // Named for what it is rather than for the function that computes it. As
  // `stripeIsLive` it shadowed that function inside this scope, which is a
  // small thing until a rename elsewhere needs to find every use of one and
  // not the other.
  stripeCharging: boolean,
  entitlements: readonly EntitlementRow[],
  now: number,
): LiveSource[] {
  const out: LiveSource[] = [];
  if (stripeCharging) out.push({ source: "stripe" });

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
