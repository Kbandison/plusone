import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The purchase path, pinned by reading it.
 *
 * Everything below only happens inside a WKWebView, against Apple's own sheet,
 * on a device with a Sandbox account — so none of it has a runtime surface any
 * test environment here can reach. What it can do is refuse the specific wrong
 * versions, each of which is a plausible reading that costs a member money.
 */
const HERE = import.meta.dirname;
const purchase = readFileSync(join(HERE, "native-purchase.tsx"), "utf8");
const recovery = readFileSync(join(HERE, "../../native-iap-recovery.tsx"), "utf8");
const buttons = readFileSync(join(HERE, "plan-buttons.tsx"), "utf8");
const layout = readFileSync(join(HERE, "../../layout.tsx"), "utf8");

describe("a transaction is finished only when the server has answered", () => {
  /**
   * `ok: true` finishes REGARDLESS of `premium`.
   *
   * The intuitive reading is that finishing is the reward for a grant, so a
   * transaction that did not make anybody premium should be left alone. It is
   * exactly backwards: a genuine but spent transaction — expired, refunded —
   * returns `{ ok: true, premium: false }` and has been dealt with. Left open,
   * StoreKit re-offers it on every launch, forever.
   */
  it("does not make finishing conditional on premium", () => {
    for (const source of [purchase, recovery]) {
      // The failure shape: finishing gated on the grant rather than on ok.
      expect(source).not.toMatch(
        /if\s*\([^)]*\.premium[^)]*\)\s*\{?\s*await finishNativeTransaction/,
      );
    }
    expect(recovery).toMatch(/if\s*\(!transaction \|\| !result\.ok\) continue;/);
  });

  /**
   * A verification failure must NOT finish. Redelivery is the recovery: an
   * unfinished transaction comes back next launch and gets another chance,
   * which is the only thing between a failed grant and money taken for nothing.
   */
  it("leaves an unverified transaction open so it comes back", () => {
    expect(purchase).toMatch(
      /if\s*\(!result\.ok\)\s*\{\s*setNotice\(noticeFor\(result\.reason\)\);\s*return false;/,
    );
  });

  /**
   * Restore is NOT the launch pass, and the difference is easy to miss.
   *
   * `nativeUnfinishedTransactions()` returns transactions StoreKit is
   * redelivering — open, and finished on success. `nativeEntitlements()`
   * returns what the Apple ID owns, which was finished long ago; calling finish
   * on one finds nothing and answers false. Nothing here reads that false, but
   * the two flows must stay visibly different or the next person will.
   */
  it("finishes on purchase and recovery, and not on restore", () => {
    expect(purchase).toMatch(/await redeem\(outcome\.transaction, true\)/);
    expect(purchase).toMatch(/await redeem\(transaction, false\)/);
  });
});

describe("what the shell is allowed to say a plan costs", () => {
  /**
   * Apple's own localized string, and nothing derived from `PLANS`.
   *
   * `priceCents` is what Stripe charges in USD. App Store pricing is
   * per-storefront and Apple moves tiers without anybody here touching them, so
   * the two agree today and are not the same number. Formatting our figure into
   * this screen promises one amount and debits another.
   */
  it("renders Apple's displayPrice rather than our own money", () => {
    expect(purchase).toMatch(/\{product\.displayPrice\}/);
    expect(purchase).not.toMatch(/formatPriceCents/);
    expect(purchase).not.toMatch(/plan\.priceCents/);
  });

  /** The per-month line divides Apple's figure, so it is in Apple's currency. */
  it("derives the per-month line from the same currency as the price", () => {
    expect(purchase).toMatch(/C\.perMonth\(Math\.round\(product\.priceCents \/ plan\.months\)\)/);
  });

  /**
   * A product missing from App Store Connect comes back absent rather than as
   * an error, so rendering from PLANS alone draws a button whose only outcome
   * is a failed purchase.
   */
  it("only offers plans the store actually returned", () => {
    expect(purchase).toMatch(/products\.find\(\(p\) => p\.id === plan\.appleProductId\)/);
  });
});

describe("who a purchase belongs to", () => {
  /**
   * `appAccountToken` is the member's own id. It travels inside the signed
   * transaction and comes back on every renewal and server notification, and it
   * is the only thing binding an Apple ID's subscription to a Plus One account
   * — the server refuses a transaction without it rather than guessing.
   */
  it("sends the member id as the account token", () => {
    expect(purchase).toMatch(/purchaseNativeProduct\(appleProductId, userId\)/);
  });

  /**
   * The reverse double-subscription guard, and it takes a prop.
   *
   * The liveness test has been got wrong twice in two days, both times by
   * asking whether a row EXISTS rather than whether it is currently charging,
   * and by reading the date before the status — a revoked entitlement keeps its
   * expiry, so `expires_at > now` alone says somebody is paying when they are
   * not. There is one implementation, in `subscription-source`. This is not a
   * third: the page computes it and passes it down.
   */
  it("takes stripe liveness as a prop rather than working it out again", () => {
    expect(buttons).toMatch(/alreadyPayingStripe=\{alreadyPayingStripe\}/);
    expect(purchase).toMatch(/if \(alreadyPayingStripe\)/);
    for (const forbidden of [/isLive\(/, /expires_at/, /Date\.parse/]) {
      expect(purchase).not.toMatch(forbidden);
    }
  });
});

describe("the purchases nobody pressed a button for", () => {
  /**
   * Mounted in the app layout, not on the premium screen. A renewal, and a
   * grant that failed to land, arrive with the member reading a message
   * somewhere else entirely — and a recovery that only runs where somebody is
   * already looking at their subscription recovers nothing.
   */
  it("runs everywhere in the app rather than on one screen", () => {
    expect(layout).toMatch(/<NativeIapRecovery \/>/);
  });

  /** Renewals and Ask-to-Buy approvals arrive as an event, not as a return. */
  it("listens for transactions that arrive on their own", () => {
    expect(recovery).toMatch(/onNativeTransaction\(/);
    expect(recovery).toMatch(/nativeUnfinishedTransactions\(\)/);
  });
});
