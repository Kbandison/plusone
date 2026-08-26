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
