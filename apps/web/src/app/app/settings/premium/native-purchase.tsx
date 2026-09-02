"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { DRAFT_COPY, PLANS } from "@plusone/config";

import {
  finishNativeTransaction,
  nativeEntitlements,
  nativeStoreProducts,
  purchaseNativeProduct,
  type NativeProduct,
  type NativeTransaction,
} from "@/lib/native-iap";
import { buttonClass } from "@/app/ui";
import { submitAppStoreTransaction } from "./iap-actions";

const C = DRAFT_COPY.app;

/**
 * Buying premium inside the iOS shell, which is the only way it may be sold
 * there.
 *
 * Guideline 3.1.1: a subscription unlocking features inside an iOS app goes
 * through in-app purchase. `e8eee7d` hid the Stripe checkout here for that
 * reason and left the paid tier unreachable — correct, and a dead end. This is
 * what replaces it.
 *
 * ── the order of operations is the whole design ─────────────────────────────
 *
 * Apple's sheet returns a SIGNED transaction. It goes to the server, which
 * checks the signature against Apple's root and writes the entitlement, and
 * only then is the transaction finished. Finishing is not the reward for a
 * grant — it is the acknowledgement that one is no longer owed. StoreKit
 * redelivers an unfinished transaction on every launch, and that redelivery is
 * the only thing standing between "the grant request failed" and money taken
 * for nothing.
 *
 * Which is why `ok: true` finishes REGARDLESS of `premium`. A genuine but spent
 * transaction — expired, refunded — comes back `{ ok: true, premium: false }`,
 * and it has been dealt with; leaving it open means the device offers it again
 * forever. `premium` decides what to draw. `ok` decides what to finish.
 */
type Notice = { readonly tone: "error" | "info"; readonly text: string } | null;

function noticeFor(reason: "unverified" | "not_yours" | "unbound" | "failed"): Notice {
  switch (reason) {
    case "not_yours":
      return { tone: "error", text: C.premiumPurchaseNotYours };
    case "unbound":
      return { tone: "error", text: C.premiumPurchaseUnbound };
    // "unverified" and "failed" are the same sentence on purpose. The
    // difference between them matters to a log and to nobody holding a phone,
    // and naming it would only invite a member to diagnose it.
    default:
      return { tone: "error", text: C.premiumPurchaseFailed };
  }
}

export function NativePlanChooser({
  userId,
  alreadyPayingStripe,
}: {
  userId: string;
  alreadyPayingStripe: boolean;
}) {
  const router = useRouter();
  const [products, setProducts] = useState<NativeProduct[] | null | "loading">("loading");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    let live = true;
    void nativeStoreProducts(PLANS.map((plan) => plan.appleProductId)).then((found) => {
      if (live) setProducts(found);
    });
    return () => {
      live = false;
    };
  }, []);

  /**
   * Submit, then finish, then let the page re-read.
   *
   * `router.refresh()` rather than any local "you are premium now" state: the
   * premium page reads entitlements, grants and `is_premium()` together, and a
   * screen that decides for itself what a purchase meant is a second opinion
   * about who is paying. There is already one of those and it is the database.
   */
  const redeem = useCallback(
    async (transaction: NativeTransaction, finish: boolean) => {
      const result = await submitAppStoreTransaction(transaction.jws);
      if (!result.ok) {
        setNotice(noticeFor(result.reason));
        return false;
      }
      /**
       * Only a transaction that is UNFINISHED has anything to finish.
       *
       * A purchase, and anything StoreKit is redelivering, arrives open and is
       * acknowledged here. What `nativeEntitlements()` returns is the opposite:
       * Apple's record of what this Apple ID owns, already finished long ago.
       * Calling finish on one finds nothing and answers false — harmless in
       * itself, and precisely the sort of false that gets read as a failed
       * restore by the next person to touch this.
       */
      if (finish) await finishNativeTransaction(transaction.transactionId);
      router.refresh();
      return true;
    },
    [router],
  );

  const buy = useCallback(
    async (appleProductId: string) => {
      setNotice(null);
      setBusy(appleProductId);
      try {
        // The member's own id, which travels inside the signed transaction and
        // comes back on every renewal. It is what binds an Apple ID's
        // subscription to this account rather than to whoever presents it.
        const outcome = await purchaseNativeProduct(appleProductId, userId);
        if (!outcome) {
          setNotice({ tone: "error", text: C.premiumStoreUnavailable });
          return;
        }
        // Cancelled is not a failure and gets no message. Somebody who changed
        // their mind does not need telling what they just did.
        if (outcome.status === "cancelled") return;
        if (outcome.status === "pending") {
          setNotice({ tone: "info", text: C.premiumPurchasePending });
          return;
        }
        if (outcome.status !== "success") {
          setNotice({ tone: "error", text: C.premiumPurchaseFailed });
          return;
        }
        await redeem(outcome.transaction, true);
      } finally {
        setBusy(null);
      }
    },
    [redeem, userId],
  );

  /**
   * What Apple already considers bought.
   *
   * A subscription belongs to an Apple ID, so a reinstall or a new phone
   * arrives showing nothing. Without this the only visible route back is to buy
   * again — which Apple would refuse, with a message about already being
   * subscribed that explains nothing about why the app disagrees.
   */
  const restore = useCallback(async () => {
    setNotice(null);
    setBusy("restore");
    try {
      const owned = await nativeEntitlements();
      if (owned === null) {
        setNotice({ tone: "error", text: C.premiumStoreUnavailable });
        return;
      }
      if (owned.length === 0) {
        setNotice({ tone: "info", text: C.premiumRestoreNone });
        return;
      }
      let granted = false;
      for (const transaction of owned) granted = (await redeem(transaction, false)) || granted;
      if (!granted) setNotice({ tone: "info", text: C.premiumRestoreNone });
    } finally {
      setBusy(null);
    }
  }, [redeem]);

  /**
   * Already paying Stripe, so nothing is for sale.
   *
   * The page hides the chooser from anybody `is_premium()` calls premium, and
   * this is narrower and separate: that question is true for a referral grant
   * too, and somebody whose grant lapses next week has every reason to buy now.
   * This one is "are they already being charged on the web" — and if they are,
   * a second subscription bills them twice with nothing in the app saying so.
   * `startCheckout` refuses the mirror image of this for the same reason.
   *
   * Restore stays available. Somebody in this state may still have an App Store
   * subscription this account has not seen.
   */
  if (alreadyPayingStripe) {
    return (
      <div className="mt-8">
        <p className="text-[12.6px] text-ink-2">{C.premiumAlreadyOnWeb}</p>
        <RestoreButton busy={busy === "restore"} onRestore={restore} />
        <NoticeLine notice={notice} />
      </div>
    );
  }

  if (products === "loading") {
    return (
      <p className="mt-8 text-[12.6px] text-ink-3" role="status">
        {C.premiumStoreLoading}
      </p>
    );
  }

  // Null is a shell too old to have the plugin, a device with no App Store
  // account, or Apple being unreachable. All three are "not now" rather than
  // "never", and none of them is worth a member's attention beyond one line.
  if (products === null) {
    return (
      <div className="mt-8">
        <p role="alert" className="text-[12.6px] text-critical">
          {C.premiumStoreUnavailable}
        </p>
        <RestoreButton busy={busy === "restore"} onRestore={restore} />
      </div>
    );
  }

  /**
   * Only plans Apple actually returned.
   *
   * A product id that is missing from App Store Connect, or not yet approved,
   * comes back absent rather than as an error — so rendering from `PLANS`
   * alone would draw a button whose only possible outcome is a failed purchase.
   * Drawing nothing is the honest version of not having it for sale.
   */
  const sellable = PLANS.map((plan) => ({
    plan,
    product: products.find((p) => p.id === plan.appleProductId),
  })).filter((row): row is { plan: (typeof PLANS)[number]; product: NativeProduct } =>
    Boolean(row.product),
  );

  if (sellable.length === 0) {
    return (
      <div className="mt-8">
        <p role="alert" className="text-[12.6px] text-critical">
          {C.premiumStoreUnavailable}
        </p>
        <RestoreButton busy={busy === "restore"} onRestore={restore} />
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-col gap-4">
      {sellable.map(({ plan, product }) => (
        <div
          key={plan.id}
          className={`rounded-xl border bg-surface p-6 ${
            plan.highlighted ? "border-accent" : "border-line-2"
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id={`${plan.id}-label`} className="text-[0.972rem]">
              {plan.label}
            </h2>
            {/* Apple's own string, in the member's storefront currency. Never
                formatted from PLANS[].priceCents, which is what Stripe charges
                in USD — the two agree today and are not the same number. */}
            <span id={`${plan.id}-price`} className="text-[12.2px] text-ink-2">
              {product.displayPrice}
            </span>
          </div>

          {/* Divided from Apple's figure rather than ours, so the per-month line
              is in the same currency as the price above it. */}
          <p className="mt-1.5 text-[11px] text-ink-3">
            {C.perMonth(Math.round(product.priceCents / plan.months))}
          </p>

          <button
            type="button"
            onClick={() => void buy(plan.appleProductId)}
            disabled={busy !== null}
            /* Three buttons all reading "Choose", and the plan is carried by the
               handler rather than by anything a screen reader can see. Same
               reason the web form labels them: this is the page where the wrong
               choice costs money. */
            aria-labelledby={`${plan.id}-label ${plan.id}-price`}
            className={`ease-brand mt-5 rounded-lg px-5 py-2.5 text-[12.2px] transition-opacity duration-300 hover:opacity-90 disabled:opacity-55 ${
              plan.highlighted ? "bg-accent text-accent-ink" : "border border-line-2 text-ink"
            }`}
          >
            {C.choosePlanLabel}
          </button>
        </div>
      ))}

      <RestoreButton busy={busy === "restore"} onRestore={restore} />
      <NoticeLine notice={notice} />
    </div>
  );
}

function RestoreButton({ busy, onRestore }: { busy: boolean; onRestore: () => Promise<void> }) {
  return (
    <button
      type="button"
      onClick={() => void onRestore()}
      disabled={busy}
      className={`${buttonClass("secondary")} mt-2 self-start`}
    >
      {C.premiumRestoreLabel}
    </button>
  );
}

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p
      // A purchase message is the result of something the member just pressed,
      // so it has to reach a screen reader without being hunted for.
      role={notice.tone === "error" ? "alert" : "status"}
      className={`mt-3 text-[11.7px] ${notice.tone === "error" ? "text-critical" : "text-ink-2"}`}
    >
      {notice.text}
    </p>
  );
}
