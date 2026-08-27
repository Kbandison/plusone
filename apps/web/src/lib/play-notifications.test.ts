import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { readPlayNotification } from "./play-notifications";

/**
 * The fixture is real.
 *
 * Play Console's "send test notification" button published this on
 * 2026-08-27T05:33Z and it was read straight off the `play-rtdn-sub`
 * subscription — envelope shape, base64 body and all — rather than written from
 * the reference. Which is worth something: the reference lists a
 * `subscriptionId` on SubscriptionNotification that the current shape does not
 * carry, and a handler built only from documentation would have read a field
 * that is never there.
 */
const push = (payload: unknown) => ({
  message: {
    data: Buffer.from(JSON.stringify(payload)).toString("base64"),
    messageId: "136969346945",
    publishTime: "2026-08-27T05:33:10.076Z",
  },
  subscription: "projects/luxweb-studio/subscriptions/play-rtdn-sub",
});

/** Exactly what arrived, byte for byte. */
const REAL_TEST_NOTIFICATION = {
  version: "1.0",
  packageName: "app.loveplusone",
  eventTimeMillis: "1787808790010",
  testNotification: { version: "1.0" },
};

describe("reading a Play notification", () => {
  it("recognises the real test notification Play sent", () => {
    expect(readPlayNotification(push(REAL_TEST_NOTIFICATION))).toEqual({ kind: "test" });
  });

  it("carries a subscription change through as a token to re-check", () => {
    // Note what is NOT extracted: any opinion about what happened. The type is
    // kept for the log and never mapped onto a status, because the handler asks
    // Google rather than guessing — which is Google's own instruction.
    const n = readPlayNotification(
      push({
        packageName: "app.loveplusone",
        subscriptionNotification: { version: "1.0", notificationType: 4, purchaseToken: "tok-1" },
      }),
    );
    expect(n).toEqual({ kind: "subscription", purchaseToken: "tok-1", type: 4 });
  });

  it("marks a voided purchase as its own kind", () => {
    // The one case the notification knows more than the lookup: money went
    // back. subscriptionsv2 may still describe it as cancelled with time left.
    const n = readPlayNotification(
      push({
        packageName: "app.loveplusone",
        voidedPurchaseNotification: { purchaseToken: "tok-2", orderId: "o", productType: 1 },
      }),
    );
    expect(n).toEqual({ kind: "voided", purchaseToken: "tok-2" });
  });

  it("refuses a notification about another app", () => {
    // Public endpoint. "Delivered by Google" and "about our app" are different
    // claims, and only the second one is checked here.
    expect(() =>
      readPlayNotification(
        push({
          packageName: "com.someone.else",
          subscriptionNotification: { notificationType: 2, purchaseToken: "t" },
        }),
      ),
    ).toThrow(/notification is for com\.someone\.else/);
  });

  it("accepts a test notification even without a package name", () => {
    // The order matters: the package check comes AFTER the test branch, so the
    // one diagnostic Play Console offers cannot be the thing that fails. Same
    // reasoning as TEST on the Apple side.
    expect(readPlayNotification(push({ testNotification: { version: "1.0" } }))).toEqual({
      kind: "test",
    });
  });

  it("ignores a shape this app does not sell", () => {
    const n = readPlayNotification(
      push({
        packageName: "app.loveplusone",
        oneTimeProductNotification: { purchaseToken: "t", sku: "x" },
      }),
    );
    expect(n).toMatchObject({ kind: "ignored" });
  });

  it("refuses an envelope with nothing in it", () => {
    expect(() => readPlayNotification({})).toThrow(/no message data/);
    expect(() => readPlayNotification({ message: { data: "not base64 json" } })).toThrow(
      /not json/,
    );
  });
});

/**
 * The route is a handler, so what is checked is that the decisions it must not
 * get wrong are still written down.
 */
describe("the Play notification route", () => {
  const source = readFileSync(
    new URL("../app/api/play/notifications/route.ts", import.meta.url),
    "utf8",
  );

  it("asks Google rather than believing the payload", () => {
    // Google's own words: the notification says the state changed, not what it
    // changed to. A handler that mapped notificationType onto a status would be
    // inventing information it was told it does not have.
    expect(source).toMatch(/verifyPlayPurchase\(notification\.purchaseToken\)/);
    expect(source).not.toMatch(/notificationType\s*===/);
  });

  it("records a refund without asking, because the lookup may disagree", () => {
    expect(source).toMatch(/kind === "voided"/);
    expect(source).toMatch(/status: "revoked" as const/);
  });

  it("updates and never inserts", () => {
    // A notification identifies a subscription, not a member. Creating a row
    // would invent the binding record_iap_entitlement exists to protect.
    expect(source).toMatch(/\.update\(update\)/);
    expect(source).not.toMatch(/\.(insert|upsert)\(/);
  });

  it("takes the expiry from Google and never from a clock", () => {
    expect(source).toMatch(/expires_at: purchase\.expiresAt/);
    expect(source).not.toMatch(/expires_at:[^,]*Date\.now\(\)/);
  });

  it("retries what is worth retrying and refuses what is not", () => {
    // 401 and 500 are retried by Pub/Sub, which is right for a caller that may
    // be a minute from being configured and for a lookup that may recover. 400
    // is not: a message that will not parse now will not parse later either.
    expect(source).toMatch(/status: 401/);
    expect(source).toMatch(/status: 400/);
    expect(source).toMatch(/status: 500/);
  });

  it("verifies the caller before doing any work", () => {
    // Not what makes the entitlement safe — nothing in the payload is trusted.
    // What it stops is a stranger making this endpoint call Google all day.
    // The CALL sites, not the imports — the first version of this compared
    // `indexOf` on the bare names and was really asserting that the import list
    // is alphabetical, which it is, and which says nothing about order of
    // execution.
    const callerAt = source.indexOf("await verifyPushCaller(");
    const readAt = source.indexOf("readPlayNotification(await");
    expect(callerAt).toBeGreaterThan(-1);
    expect(readAt).toBeGreaterThan(-1);
    expect(callerAt).toBeLessThan(readAt);
  });

  it("logs a count and never the purchase token", () => {
    expect(source).not.toMatch(/console\.\w+\([^)]*purchaseToken/);
    expect(source).toMatch(/rows: data\?\.length/);
  });
});
