"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  finishNativeTransaction,
  nativeUnfinishedTransactions,
  onNativeTransaction,
  type NativeTransaction,
} from "@/lib/native-iap";
import { submitAppStoreTransactions } from "./settings/premium/iap-actions";

/**
 * The purchases nobody pressed a button for.
 *
 * Two things arrive without anyone standing on the premium screen, and both are
 * money that has to become premium:
 *
 * **What StoreKit is still redelivering.** A transaction stays open until the
 * server has granted, so a purchase whose grant was lost — a dead network, a
 * deploy mid-flight, the app killed — is re-offered on the next launch. That
 * redelivery is the entire safety net under the payment path, and it only works
 * if something collects it. Nothing else does.
 *
 * **Renewals.** A subscription that renews monthly produces a transaction with
 * no UI attached to it at all, and an Ask-to-Buy approval can land days after
 * the child asked. Both come through `Transaction.updates`, which the native
 * side retains until consumed — so a listener attached after launch still gets
 * one that fired while the page was loading.
 *
 * Mounted in the app layout rather than on the premium screen, because the
 * whole point is that the member is not looking at it. It renders nothing, says
 * nothing, and asks for nothing: a member who has just opened the app to read a
 * message should not be told about the plumbing that kept their subscription
 * working.
 *
 * Silent about failures too, deliberately. A transaction that cannot be
 * verified is left unfinished, which means StoreKit offers it again next
 * launch — the recovery IS the retry, and an error message here would only
 * describe something already being handled.
 */
export function NativeIapRecovery() {
  const router = useRouter();

  useEffect(() => {
    let live = true;

    /**
     * Submit, then finish only what the server accepted.
     *
     * `ok: true` finishes whatever `premium` says — a genuine but spent
     * transaction has been dealt with, and leaving it open means the device
     * offers it forever. Anything else is left open on purpose.
     */
    const redeem = async (pending: readonly NativeTransaction[]) => {
      if (pending.length === 0) return;
      const results = await submitAppStoreTransactions(pending.map((t) => t.jws));
      let granted = false;
      for (const [index, result] of results.entries()) {
        const transaction = pending[index];
        if (!transaction || !result.ok) continue;
        await finishNativeTransaction(transaction.transactionId);
        granted = granted || result.premium;
      }
      // Only when something actually changed. A refresh on every launch would
      // re-render the app for the overwhelmingly common case of nothing having
      // happened.
      if (granted && live) router.refresh();
    };

    void (async () => {
      const pending = await nativeUnfinishedTransactions();
      if (!live || !pending) return;
      await redeem(pending);
    })();

    const stop = onNativeTransaction((transaction) => {
      if (live) void redeem([transaction]);
    });

    return () => {
      live = false;
      stop?.();
    };
  }, [router]);

  return null;
}
