"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { DRAFT_COPY, PLANS } from "@plusone/config";

import {
  playBillingAvailable,
  playDiagnostics,
  playProducts,
  playPurchases,
  purchasePlayProduct,
  type PlayItemDetails,
} from "@/lib/play-iap";
import { buttonClass } from "@/app/ui";
import { submitPlayPurchase } from "./play-actions";

const C = DRAFT_COPY.app;

/**
 * Buying premium inside the Android shell.
 *
 * The mirror of `native-purchase.tsx`, and deliberately the same shape — same
 * copy, same states, same order of operations — so the two shells can be read
 * against each other. Play's policy is Apple's 3.1.1 in different words: a
 * subscription unlocking features inside an app distributed on Play goes
 * through Play billing, so the Stripe checkout is hidden here too.
 *
 * ── what differs, and it is only one thing ──────────────────────────────────
 *
 * There is no `finish`. Apple's transaction stays open until the server grants
 * and the client closes it; Play's equivalent is ACKNOWLEDGEMENT, and that
 * happens server-side in `submitPlayPurchase` — the Digital Goods API's
 * `consume()` is for one-time products somebody needs to buy again, not for
 * this.
 *
 * The stake is higher than Apple's, though. An unfinished StoreKit transaction
 * is redelivered forever; an unacknowledged Play subscription is REFUNDED after
 * 72 hours, silently. So a purchase token that never reaches the server is
 * money the member loses and we never see.
 */
type Notice = { readonly tone: "error" | "info"; readonly text: string } | null;

function noticeFor(reason: "unverified" | "not_yours" | "unbound" | "failed"): Notice {
  switch (reason) {
    case "not_yours":
      return { tone: "error", text: C.premiumPurchaseNotYours };
    case "unbound":
      return { tone: "error", text: C.premiumPurchaseUnbound };
    default:
      return { tone: "error", text: C.premiumPurchaseFailed };
  }
}

/**
 * Play gives a number and a currency code rather than a formatted string.
 *
 * Apple hands over `displayPrice` already written for the storefront; Play does
 * not, so this is the same job done here. `Intl` rather than a template, because
 * the currency is whatever the member's Play account uses and the placement of
 * the symbol is not ours to guess.
 */
function money(value: string, currency: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${value} ${currency}`;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    // An unrecognised currency code throws rather than degrading. Showing the
    // raw pair is worse than a symbol and better than nothing.
    return `${value} ${currency}`;
  }
}

export function PlayPlanChooser({ alreadyPayingStripe }: { alreadyPayingStripe: boolean }) {
  const router = useRouter();
  const [products, setProducts] = useState<PlayItemDetails[] | null | "loading">("loading");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  /**
   * Only with `?debug=play` in the url, and only because a TWA has no console
   * anybody can reach without a USB cable. Removed once Android has been
   * bought from once.
   */
  const [diagnostics, setDiagnostics] = useState<string[] | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("debug") !== "play") return;
    void playDiagnostics(PLANS.map((plan) => plan.playProductId)).then(setDiagnostics);
  }, []);

  useEffect(() => {
    let live = true;
    void playProducts(PLANS.map((plan) => plan.playProductId)).then((found) => {
      if (live) setProducts(found);
    });
    return () => {
      live = false;
    };
  }, []);

  /**
   * Send the token, then let the page re-read.
   *
   * `router.refresh()` rather than any local "you are premium now": the premium
   * page reads entitlements, grants and `is_premium()` together, and a screen
   * that decides for itself what a purchase meant is a second opinion about who
   * is paying. There is one of those already and it is the database.
   */
  const redeem = useCallback(
    async (purchaseToken: string) => {
      const result = await submitPlayPurchase(purchaseToken);
      if (!result.ok) {
        setNotice(noticeFor(result.reason));
        return false;
      }
      router.refresh();
      return true;
    },
    [router],
  );

  const buy = useCallback(
    async (playProductId: string) => {
      setNotice(null);
      setBusy(playProductId);
      try {
        const outcome = await purchasePlayProduct(playProductId);
        if (!outcome || outcome.status === "unavailable") {
          setNotice({ tone: "error", text: C.premiumPlayUnavailable });
          return;
        }
        // Cancelled is not a failure and gets no message. Somebody who changed
        // their mind does not need telling what they just did.
        if (outcome.status === "cancelled") return;
        await redeem(outcome.purchaseToken);
      } finally {
        setBusy(null);
      }
    },
    [redeem],
  );

  /**
   * What Play already considers bought.
   *
   * A subscription belongs to a Google account, so a reinstall or a new phone
   * arrives showing nothing. This also catches the case that matters most here:
   * a purchase whose token never reached the server, which without a second
   * chance would be refunded in 72 hours and never mentioned again.
   */
  const restore = useCallback(async () => {
    setNotice(null);
    setBusy("restore");
    try {
      const owned = await playPurchases();
      if (owned === null) {
        setNotice({ tone: "error", text: C.premiumPlayUnavailable });
        return;
      }
      if (owned.length === 0) {
        setNotice({ tone: "info", text: C.premiumRestoreNone });
        return;
      }
      let granted = false;
      for (const purchase of owned) granted = (await redeem(purchase.purchaseToken)) || granted;
      if (!granted) setNotice({ tone: "info", text: C.premiumRestoreNone });
    } finally {
      setBusy(null);
    }
  }, [redeem]);

  /**
   * Already paying Stripe, so nothing is for sale — the same guard the iOS
   * chooser applies, and the mirror of the one `startCheckout` applies from the
   * other side. Restore stays available: somebody in this state may still have
   * a Play subscription this account has not seen.
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

  const debugPanel = diagnostics ? (
    <pre className="mt-4 overflow-x-auto rounded-lg border border-line-2 p-3 text-[10px] leading-[1.5] text-ink-3">
      {diagnostics.join("\n")}
    </pre>
  ) : null;

  if (products === "loading") {
    return (
      <p className="mt-8 text-[12.6px] text-ink-3" role="status">
        {C.premiumStoreLoading}
      </p>
    );
  }

  /**
   * Two different failures, told apart rather than merged.
   *
   * No billing service AT ALL means this is not the installed app — an ordinary
   * Chrome tab on the same site is the common case, and `getDigitalGoodsService`
   * simply does not exist there. "Try again in a moment" is the wrong advice:
   * trying again in that tab will never work.
   *
   * A service that exists and answered nothing is the other one, and it is
   * worth waiting out. Merging them cost a debugging session — one message for
   * both says nothing about which, and the Apple wording on an Android phone
   * made it read as the app not knowing what it was running on.
   */
  if (products === null) {
    const noService = !playBillingAvailable();
    return (
      <div className="mt-8">
        <p role="alert" className="text-[12.6px] text-critical">
          {noService ? C.premiumPlayNotInApp : C.premiumPlayUnavailable}
        </p>
        {noService ? null : <RestoreButton busy={busy === "restore"} onRestore={restore} />}
        {debugPanel}
      </div>
    );
  }

  /**
   * Only plans Play actually returned.
   *
   * `getDetails()` answers an EMPTY LIST for a product it does not know — no
   * error, no log — which is what a base plan that is not flagged backwards
   * compatible produces, and what a wrong product id produced for a whole day
   * in `PLANS`. Rendering from `PLANS` alone would draw a button whose only
   * possible outcome is a cancelled purchase.
   */
  const sellable = PLANS.map((plan) => ({
    plan,
    product: products.find((p) => p.itemId === plan.playProductId),
  })).filter((row): row is { plan: (typeof PLANS)[number]; product: PlayItemDetails } =>
    Boolean(row.product),
  );

  if (sellable.length === 0) {
    return (
      <div className="mt-8">
        <p role="alert" className="text-[12.6px] text-critical">
          {C.premiumPlayUnavailable}
        </p>
        <RestoreButton busy={busy === "restore"} onRestore={restore} />
        {debugPanel}
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
            {/* Play's own figure, in the member's storefront currency. Never
                formatted from PLANS[].priceCents, which is what Stripe charges
                in USD — the two agree today and are not the same number. */}
            <span id={`${plan.id}-price`} className="text-[12.2px] text-ink-2">
              {money(product.price.value, product.price.currency)}
            </span>
          </div>

          {/* Divided from Play's figure rather than ours, so the per-month line
              is in the same currency as the price above it. */}
          <p className="mt-1.5 text-[11px] text-ink-3">
            {C.perMonth(Math.round((Number(product.price.value) * 100) / plan.months))}
          </p>

          <button
            type="button"
            onClick={() => void buy(plan.playProductId)}
            disabled={busy !== null}
            /* Three buttons all reading "Choose", and the plan is carried by the
               handler rather than by anything a screen reader can see. This is
               the page where the wrong choice costs money. */
            aria-labelledby={`${plan.id}-label ${plan.id}-price`}
            className={`ease-brand mt-5 rounded-lg px-5 py-2.5 text-[12.2px] transition-opacity duration-200 hover:opacity-90 disabled:opacity-55 ${
              plan.highlighted ? "bg-accent text-accent-ink" : "border border-line-2 text-ink"
            }`}
          >
            {C.choosePlanLabel}
          </button>
        </div>
      ))}

      <RestoreButton busy={busy === "restore"} onRestore={restore} />
      <NoticeLine notice={notice} />
      {debugPanel}
    </div>
  );
}

function RestoreButton({ busy, onRestore }: { busy: boolean; onRestore: () => Promise<void> }) {
  return (
    <button
      type="button"
      onClick={() => void onRestore()}
      disabled={busy}
      className={`${buttonClass("secondary")} mt-2`}
    >
      {C.premiumRestoreLabel}
    </button>
  );
}

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p
      role={notice.tone === "error" ? "alert" : "status"}
      className={`mt-3 text-[11.7px] ${notice.tone === "error" ? "text-critical" : "text-ink-3"}`}
    >
      {notice.text}
    </p>
  );
}
