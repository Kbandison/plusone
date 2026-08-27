import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  APPLE_MANAGE_URL,
  alreadyPayingAStore,
  googleManageUrl,
  isLive,
  liveSources,
  statusGrants,
  stripeIsLive,
  type EntitlementRow,
} from "./subscription-source";
// One walker, taken from source-scan.ts. Two of them would be the same shape
// of bug these tests exist to catch, one level up: two scanners, one skipping a
// directory the other visits, and a rival sitting in the gap.
import { SOURCE_ROOT, sourceFiles } from "./source-scan";

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

describe("which entitlement statuses buy anything", () => {
  it("counts active and grace and nothing else", () => {
    expect(statusGrants("active")).toBe(true);
    // The one that is not obvious: the renewal payment failed and the store is
    // retrying while keeping the member in service, so the row carries a PASSED
    // expiry and still buys something.
    expect(statusGrants("grace")).toBe(true);
    for (const status of ["expired", "revoked", "paused", "", "unknown"]) {
      expect(statusGrants(status)).toBe(false);
    }
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

/**
 * The test that could actually have caught two disagreeing readings.
 *
 * `2ab1de0` found `page.tsx` and `actions.ts` answering "is Stripe charging"
 * differently for a null period end — one screen apart, opposite answers, and
 * on their way to a third once the shell's purchase guard started reading the
 * page's value. A test was already guarding this and could not have seen it: it
 * pinned the shape of the expression in `actions.ts`, which says everything
 * about that line and nothing about whether a rival exists somewhere else.
 *
 * That is the blind spot in every source-reading assertion in this repository,
 * and there are a lot of them. They pin the shape of a line; they cannot pin
 * the ABSENCE of a second implementation, because they only ever open the file
 * they were pointed at.
 *
 * So this one is pointed at all of them. The tell of a rival liveness rule is
 * naming the Stripe statuses, because that is the half nobody gets to avoid —
 * a second reading of the dates alone is a bug, but a second reading that
 * decides which statuses count is THE bug, and it has to say `trialing` out
 * loud to do it.
 */

/**
 * Where the rule is allowed to live. Being on this list is a claim that
 * somebody looked, in the style `copy-is-wired.test.ts` uses for the same
 * reason: an exception nobody has to justify stops being an exception.
 */
const MAY_DECIDE_LIVENESS = ["lib/subscription-source.ts", "lib/subscription-source.test.ts"];

describe("there is one implementation of whether Stripe is charging", () => {
  it("is the only place that decides which statuses count", () => {
    const offenders = sourceFiles(SOURCE_ROOT)
      .filter((path) => !MAY_DECIDE_LIVENESS.some((allowed) => path.endsWith(allowed)))
      .filter((path) => /["']trialing["']/.test(readFileSync(path, "utf8")))
      .map((path) => path.slice(SOURCE_ROOT.length + 1));

    // Named rather than counted, so a failure says which file to go and read.
    expect(offenders).toEqual([]);
  });

  /**
   * The two readings that disagreed, kept as cases rather than as a memory.
   *
   * A row with no period end is unreachable while
   * `subscriptions_paid_status_has_an_end` stands — which is exactly why this
   * went unnoticed, and exactly why it needs pinning: the constraint is what
   * makes it harmless, and a constraint is a thing somebody can drop.
   */
  it("treats a paid row with no end date as still charging", () => {
    const now = Date.parse("2026-08-26T00:00:00Z");
    expect(stripeIsLive({ status: "active", current_period_end: null }, now)).toBe(true);
    expect(stripeIsLive({ status: "trialing", current_period_end: null }, now)).toBe(true);
    expect(stripeIsLive({ status: "canceled", current_period_end: null }, now)).toBe(false);
  });
});

describe("there is one implementation of which statuses grant", () => {
  /**
   * Same sweep as the Stripe one above, for the other table.
   *
   * `iap-actions.ts` reported `premium: status === "active"` — a second reading
   * of which statuses grant, correct only because `entitlementStatusOf` cannot
   * currently return `grace`. Grace arrives through a server notification, not
   * a transaction; the day that changes, that line would have told a member in
   * a billing grace period they were not premium while the gate said they were.
   *
   * `grace` is the tell for the same reason `trialing` is above: a rival that
   * only re-reads dates is a bug, but a rival that decides WHICH STATUSES COUNT
   * cannot be written without naming that one out loud.
   */
  const MAY_DECIDE_GRANTS = [
    "lib/subscription-source.ts",
    "lib/subscription-source.test.ts",
    // Decides when to WRITE grace, which is a different question from whether
    // grace grants — it maps Apple's notification types onto a status and never
    // asks what a status buys. On the list because somebody looked, not because
    // the pattern was inconvenient.
    "lib/app-store-notifications.ts",
    "lib/app-store-notifications.test.ts",
    // The same case for the other store, added when this guard caught it and
    // made somebody justify it — which is the guard working rather than being
    // in the way. `playStatusOf` maps Play's seven subscription states onto our
    // four; `statusGrants` still decides what those four buy, and nothing here
    // asks that question.
    "lib/play-billing.ts",
    "lib/play-billing.test.ts",
  ];

  it("is the only place that decides which entitlement statuses count", () => {
    const offenders = sourceFiles()
      .filter((path) => !MAY_DECIDE_GRANTS.some((allowed) => path.endsWith(allowed)))
      .filter((path) => /["']grace["']/.test(readFileSync(path, "utf8")))
      .map((path) => path.slice(SOURCE_ROOT.length + 1));
    expect(offenders, `a second reading of which statuses grant: ${offenders.join(", ")}`).toEqual(
      [],
    );
  });
});
