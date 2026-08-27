import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { playStatusOf } from "./play-billing";
import { filesMatching } from "./source-scan";

/**
 * Play has seven subscription states and two of them are traps — the same two
 * shapes Apple has, which is the useful thing about having done Apple first.
 *
 * `now` is passed in rather than read, so none of this depends on a calendar.
 */
const NOW = Date.parse("2026-08-27T12:00:00Z");
const day = 86_400_000;
const future = NOW + 30 * day;
const past = NOW - day;

describe("what a Play subscription state buys", () => {
  it("grants while active and unexpired", () => {
    expect(playStatusOf("SUBSCRIPTION_STATE_ACTIVE", future, NOW)).toBe("active");
  });

  it("keeps granting after cancellation, until the term runs out", () => {
    // THE trap. CANCELED means auto-renew is off, not that access ended — the
    // member keeps what they paid for. Treating it as expired takes away a
    // month somebody has already bought, and it is the same mistake Apple's
    // DID_CHANGE_RENEWAL_STATUS invites.
    expect(playStatusOf("SUBSCRIPTION_STATE_CANCELED", future, NOW)).toBe("active");
    // And when the paid term does run out, it stops. The clock decides here,
    // not the flag.
    expect(playStatusOf("SUBSCRIPTION_STATE_CANCELED", past, NOW)).toBe("expired");
  });

  it("keeps a member in service while Play retries their card", () => {
    // The other trap, from the other direction: IN_GRACE_PERIOD carries a
    // PASSED expiry because the renewal failed. Letting the clock decide would
    // lock somebody out over a payment their bank re-authorises within the
    // hour, which is what the `grace` status exists for.
    expect(playStatusOf("SUBSCRIPTION_STATE_IN_GRACE_PERIOD", past, NOW)).toBe("grace");
  });

  it("stops when the grace period is exhausted", () => {
    // ON_HOLD is Play having given up retrying. Access ends.
    expect(playStatusOf("SUBSCRIPTION_STATE_ON_HOLD", future, NOW)).toBe("expired");
  });

  it("grants nothing while paused, however far off the resume date is", () => {
    expect(playStatusOf("SUBSCRIPTION_STATE_PAUSED", future, NOW)).toBe("paused");
  });

  it("grants nothing for a subscription that was never paid for", () => {
    expect(playStatusOf("SUBSCRIPTION_STATE_PENDING", future, NOW)).toBe("expired");
    expect(playStatusOf("SUBSCRIPTION_STATE_EXPIRED", past, NOW)).toBe("expired");
  });

  it("fails closed on a state it does not recognise", () => {
    // Google can add one. A state we do not understand must not grant, and the
    // default arm is the only thing making that true.
    expect(playStatusOf("SUBSCRIPTION_STATE_UNSPECIFIED", future, NOW)).toBe("expired");
    expect(playStatusOf(undefined, future, NOW)).toBe("expired");
    expect(playStatusOf("SOMETHING_NEW" as never, future, NOW)).toBe("expired");
  });

  it("grants nothing when there is no expiry at all", () => {
    // A granting row with no expiry is premium forever, which the schema
    // refuses to store — so this must never produce one.
    expect(playStatusOf("SUBSCRIPTION_STATE_ACTIVE", null, NOW)).toBe("expired");
  });
});

/**
 * The action is `"use server"` and cannot be imported without a request
 * context, so what is checked is that the decisions it must not get wrong are
 * still written down — and, for the ones where a rival elsewhere would be a
 * hole, that no rival exists anywhere in the tree.
 */
const read = (path: string) => readFileSync(path, "utf8");

describe("the Play purchase action", () => {
  const source = readFileSync(
    new URL("../app/app/settings/premium/play-actions.ts", import.meta.url),
    "utf8",
  );

  it("verifies with Google before reading anything", () => {
    // A purchaseToken is opaque and carries no signature. Unlike Apple's JWS
    // there is nothing offline to check, so the Developer API call IS the
    // verification and everything else depends on it having happened.
    expect(source).toMatch(/await verifyPlayPurchase\(purchaseToken\)/);
    expect(source).toMatch(/reason: "unverified"/);
  });

  it("records through the one RPC, like the Apple path", () => {
    expect(source).toMatch(/serviceClient\(\)\.rpc\("record_iap_entitlement"/);
    expect(source).toMatch(/p_store: "google"/);
    expect(source).not.toMatch(/\.(insert|upsert)\(/);
  });

  it("takes the expiry from Google and never from a clock", () => {
    expect(source).toMatch(/p_expires_at: purchase\.expiresAt/);
    expect(source).not.toMatch(/p_expires_at:[^,]*Date\.now\(\)/);
  });

  it("tells a second member it is not theirs rather than that it failed", () => {
    expect(source).toMatch(/recorded === null/);
    expect(source).toMatch(/reason: "not_yours"/);
  });

  it("logs a reason and never the purchase token", () => {
    // §9.6 — a purchaseToken identifies one person's purchase.
    expect(source).not.toMatch(/console\.\w+\([^)]*purchaseToken/);
  });
});

describe("no rival decides what a Play state grants", () => {
  it("is the only place that names Play's subscription states", () => {
    // Same sweep as the Stripe and entitlement ones. `SUBSCRIPTION_STATE_` is
    // the tell: a second reading of Play's lifecycle cannot be written without
    // naming those constants, and a second reading is how CANCELED starts
    // meaning "expired" in one file and "still paid for" in another.
    const offenders = filesMatching(
      /SUBSCRIPTION_STATE_/,
      ["lib/play-billing.ts", "lib/play-billing.test.ts"],
      read,
    );
    expect(offenders, `a second reading of Play's states: ${offenders.join(", ")}`).toEqual([]);
  });
});
