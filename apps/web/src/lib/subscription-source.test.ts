import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  APPLE_MANAGE_URL,
  alreadyPayingAStore,
  googleManageUrl,
  isLive,
  liveSources,
  stripeIsLive,
  type EntitlementRow,
} from "./subscription-source";

/**
 * Sending somebody to the wrong store to cancel is a dead end with no error.
 *
 * Neither Apple nor Google will end a subscription the other sold, and neither
 * will we — so the only thing this screen can get right is WHERE it points, and
 * the only way to get it wrong is silently.
 */
const NOW = Date.parse("2026-08-26T12:00:00Z");
const day = 86_400_000;

const row = (over: Partial<EntitlementRow> = {}): EntitlementRow => ({
  store: "apple",
  product_id: "3months",
  status: "active",
  expires_at: new Date(NOW + 30 * day).toISOString(),
  ...over,
});

describe("whether a row is charging anybody", () => {
  it("counts active and grace, which is what is_premium counts", () => {
    // The gate and this screen must agree on which rows are live, or a member
    // is told they are premium by one and shown nothing to cancel by the other.
    expect(isLive(row(), NOW)).toBe(true);
    expect(isLive(row({ status: "grace" }), NOW)).toBe(true);
  });

  it("does not count a revoked row with weeks still on the clock", () => {
    // A refund revokes now and leaves expires_at where it was. Reading the date
    // first is the mistake the schema's status constraint was written around.
    expect(isLive(row({ status: "revoked" }), NOW)).toBe(false);
    expect(isLive(row({ status: "paused" }), NOW)).toBe(false);
  });

  it("does not count one whose term has run out", () => {
    expect(isLive(row({ expires_at: new Date(NOW - day).toISOString() }), NOW)).toBe(false);
    expect(isLive(row({ expires_at: null }), NOW)).toBe(false);
  });
});

describe("whether Stripe is charging", () => {
  const sub = (status: string | null, end: string | null) => ({
    status,
    current_period_end: end,
  });
  const future = new Date(NOW + 30 * day).toISOString();
  const past = new Date(NOW - day).toISOString();

  it("counts an active or trialing subscription with time left", () => {
    expect(stripeIsLive(sub("active", future), NOW)).toBe(true);
    expect(stripeIsLive(sub("trialing", future), NOW)).toBe(true);
  });

  it("stops at the period end", () => {
    expect(stripeIsLive(sub("active", past), NOW)).toBe(false);
  });

  it("ignores a row that has stopped billing, however recent", () => {
    // The regression 30f26a2 fixed: a subscriptions row outlives the billing by
    // months, so `subscription ? ...` offered a billing portal to somebody
    // premium from a referral grant for a subscription that had ended.
    for (const status of ["canceled", "past_due", "incomplete", "unpaid", null]) {
      expect(stripeIsLive(sub(status, future), NOW)).toBe(false);
    }
  });

  it("has no subscription at all to be live", () => {
    expect(stripeIsLive(null, NOW)).toBe(false);
    expect(stripeIsLive(undefined, NOW)).toBe(false);
  });

  it("reads a null period end the way is_premium does", () => {
    // THE case the two implementations disagreed on. The page read
    // `Boolean(end) && ...` and the action read `!end || ...`, so one would
    // have drawn a plan chooser while the other refused the purchase behind it.
    //
    // Unreachable while subscriptions_paid_status_has_an_end stands, and the
    // surviving reading is the SQL gate's — which also fails safe if that
    // constraint ever goes, because refusing a second subscription is the
    // recoverable mistake and selling one to somebody already charged is not.
    expect(stripeIsLive(sub("active", null), NOW)).toBe(true);
    // And a status that grants nothing is still nothing, end or no end.
    expect(stripeIsLive(sub("canceled", null), NOW)).toBe(false);
  });
});

describe("where to send somebody to cancel", () => {
  it("routes an App Store subscription to Apple", () => {
    const [only] = liveSources(false, [row()], NOW);
    expect(only?.source).toBe("apple");
    expect(only?.manageUrl).toBe(APPLE_MANAGE_URL);
  });

  it("names the subscription in the Play link", () => {
    const [only] = liveSources(false, [row({ store: "google", product_id: "6months" })], NOW);
    expect(only?.source).toBe("google");
    // Without sku and package it lands on every subscription the member has
    // across every app, which is worse than no link for somebody trying to
    // cancel one thing.
    expect(only?.manageUrl).toContain("sku=6months");
    expect(only?.manageUrl).toContain("package=app.loveplusone");
  });

  it("builds the Play URL from the product id it is given", () => {
    // Direct, because liveSources only ever passes the row's own product id and
    // this is the function that would silently build a link to the wrong thing.
    expect(googleManageUrl("1month")).toBe(
      "https://play.google.com/store/account/subscriptions?sku=1month&package=app.loveplusone",
    );
  });

  it("shows nothing to manage when only a referral grant is in play", () => {
    // A grant is not a subscription and there is nowhere to send anybody.
    expect(liveSources(false, [], NOW)).toEqual([]);
  });

  it("ignores a store row that has stopped charging", () => {
    expect(liveSources(false, [row({ status: "revoked" })], NOW)).toEqual([]);
    expect(
      liveSources(false, [row({ expires_at: new Date(NOW - day).toISOString() })], NOW),
    ).toEqual([]);
  });

  it("surfaces BOTH when somebody is paying twice", () => {
    // The case this is plural for: subscribe on the web, install the app, buy
    // again because the app never mentioned the first one. A screen that picks
    // a single subscription hides one of the two charges from the person paying
    // it.
    const both = liveSources(true, [row()], NOW);
    expect(both.map((s) => s.source)).toEqual(["stripe", "apple"]);
  });
});

describe("the door on a second subscription", () => {
  it("refuses somebody a store is already charging", () => {
    expect(alreadyPayingAStore([row()], NOW)).toBe(true);
  });

  it("lets a referral-grant holder subscribe", () => {
    // Deliberately not is_premium(): a grant makes somebody premium and is no
    // reason to make them wait for their own reward to lapse before they can
    // pay. The question is narrower than "are they premium".
    expect(alreadyPayingAStore([], NOW)).toBe(false);
  });

  it("lets somebody whose store subscription lapsed subscribe again", () => {
    expect(alreadyPayingAStore([row({ status: "expired" })], NOW)).toBe(false);
  });
});

describe("the premium screen and the checkout door", () => {
  const page = readFileSync(
    new URL("../app/app/settings/premium/page.tsx", import.meta.url),
    "utf8",
  );
  const actions = readFileSync(
    new URL("../app/app/settings/premium/actions.ts", import.meta.url),
    "utf8",
  );
  const manage = readFileSync(
    new URL("../app/app/settings/premium/manage-store.tsx", import.meta.url),
    "utf8",
  );

  it("reads entitlements as the member, not with the service key", () => {
    // The table grants members SELECT on their own rows. Reaching for the
    // service client on a page would read past RLS for no reason.
    expect(page).toMatch(/supabase\s*\n?\s*\.from\("iap_entitlements"\)/);
    expect(page).not.toMatch(/serviceClient/);
  });

  it("offers the billing portal only while Stripe is actually charging", () => {
    // `subscription ? <ManageBilling/>` was the old test, and a row exists long
    // after it stops billing — so a lapsed subscriber premium from a grant was
    // offered a portal for a subscription that had ended.
    expect(page).toMatch(/stripeLive \? \(/);
    expect(page).not.toMatch(/\{subscription \? <ManageBilling \/> : null\}/);
  });

  it("asks the one liveness function rather than inlining a second reading", () => {
    // There were two, disagreeing on the null period end. The shell's purchase
    // guard now takes this value as a prop, so a third reading would have been
    // three places to keep in step.
    expect(page).toMatch(/stripeIsLive\(subscription as StripeRow \| null, now\)/);
    expect(actions).toMatch(/stripeIsLive\(existing as StripeRow \| null, Date\.now\(\)\)/);
    for (const source of [page, actions]) {
      expect(source).not.toMatch(/status === "trialing"/);
    }
  });

  it("checks the store door in the action and not only in the page", () => {
    // The page hiding the chooser is presentation. A form rendered before
    // subscribing and submitted after, a second tab, or a direct POST all
    // arrive at the action.
    expect(actions).toMatch(/alreadyPayingAStore/);
  });

  it("does not hide the store link inside the shell", () => {
    // plan-buttons.tsx hides checkout AND the portal on 3.1.1. This is the
    // opposite case — Apple requires an IAP subscription be managed through
    // their own screen, so hiding it would leave no way to cancel from the app
    // it was bought in.
    expect(manage).not.toMatch(/inNativeShell|useOffersPurchase/);
  });
});
