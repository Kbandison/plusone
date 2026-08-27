import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PLANS } from "./pricing";

/**
 * The App Store product IDs, pinned to what is actually in App Store Connect.
 *
 * These cannot be edited once created and cannot be reused once deleted, so the
 * console is the source of truth and this file is a copy of it. The copy is
 * worth having because the alternative — deriving them from `PlanId`, which is
 * what anyone would reach for — produces `premium_1mo` and silently fails to
 * find a product at purchase time.
 */
describe("Apple product IDs", () => {
  const expected: Record<string, string> = {
    premium_1mo: "1month",
    premium_3mo: "3months",
    premium_6mo: "6months",
  };

  it.each(PLANS)("$id maps to the product that exists", (plan) => {
    expect(plan.appleProductId).toBe(expected[plan.id]);
  });

  /**
   * Not derivable from the plan id, and that is the point: a helper that built
   * one by string manipulation would look right and find nothing.
   */
  it("is not derived from the plan id", () => {
    for (const plan of PLANS) {
      expect(plan.appleProductId).not.toContain("premium");
    }
  });

  /** Distinct, or two tiers unlock from one purchase. */
  it("gives every tier its own product", () => {
    const ids = PLANS.map((p) => p.appleProductId);
    expect(new Set(ids).size).toBe(PLANS.length);
  });
});

/**
 * The Play product IDs, pinned the same way and for the same reason.
 *
 * These used to say they were identical to `appleProductId` and that the
 * identity was a deliberate convenience. Both halves were wrong: Kevin said he
 * would rename Play's to match and I recorded it as done, and Play's real ids
 * turned out to be `premium1month`, `premium3months` and `premium6months` —
 * read out of the Play Developer API on 2026-08-27, once there was a credential
 * to read it with.
 *
 * So the argument for two fields is no longer hypothetical. Had they been
 * collapsed into one `storeProductId` while they appeared to match, correcting
 * Play would have silently broken Apple, whose ids are real and unchanged. The
 * failure would have been the quiet kind too: `getDetails()` returns an EMPTY
 * LIST for an id Play does not know, so the pricing screen simply has nothing
 * on it and nothing anywhere says why.
 */
describe("Play product IDs", () => {
  const expected: Record<string, string> = {
    premium_1mo: "premium1month",
    premium_3mo: "premium3months",
    premium_6mo: "premium6months",
  };

  it.each(PLANS)("$id maps to the subscription that exists", (plan) => {
    expect(plan.playProductId).toBe(expected[plan.id]);
  });

  /**
   * NOT derivable from the plan id, still — but the check has to change shape,
   * because Play's real ids do begin with "premium". `premium_1mo` is the plan
   * id and `premium1month` is the product; an underscore apart, and neither is
   * reachable from the other by any rule worth writing.
   */
  it("is not derived from the plan id", () => {
    for (const plan of PLANS) {
      expect(plan.playProductId).not.toBe(plan.id);
      expect(plan.playProductId).not.toContain("_");
    }
  });

  /** Distinct, or two tiers unlock from one purchase. */
  it("gives every tier its own subscription", () => {
    const ids = PLANS.map((p) => p.playProductId);
    expect(new Set(ids).size).toBe(PLANS.length);
  });

  /**
   * A subscription product id, never a base plan id.
   *
   * A TWA cannot address a base plan — `getDetails()` takes product ids, a base
   * plan id returns an empty list, and a PaymentRequest naming one comes back
   * RESULT_CANCELED. So each tier is its own subscription, and three of them is
   * the count that proves it: one subscription carrying three base plans would
   * leave every plan pointing at the same string.
   */
  it("names three separate subscriptions, not one with base plans", () => {
    expect(new Set(PLANS.map((p) => p.playProductId)).size).toBe(3);
  });

  /**
   * The two fields stay two fields.
   *
   * Read from the source rather than the value, because the value cannot show
   * this: `playProductId: plan.appleProductId` would pass every assertion above
   * while quietly making one console's namespace govern the other. Apple and
   * Play are separate permanent namespaces and either can be forced to move.
   */
  it("declares each store's id separately rather than aliasing one", () => {
    const source = readFileSync(new URL("./pricing.ts", import.meta.url), "utf8");
    const plans = source.slice(source.indexOf("export const PLANS"));
    expect(plans.match(/appleProductId:/g)).toHaveLength(PLANS.length);
    expect(plans.match(/playProductId:/g)).toHaveLength(PLANS.length);
    // Each is a literal. Neither reads the other.
    expect(plans).not.toMatch(/playProductId:(?!\s*")/);
    expect(plans).not.toMatch(/appleProductId:(?!\s*")/);
  });
});
