"use server";

import { revalidatePath } from "next/cache";

import {
  JwsError,
  entitlementStatusOf,
  verifyAppStoreJws,
  type AppStoreTransaction,
} from "@/lib/app-store-jws";
import { serviceClient } from "@/lib/cron";
import { getServerSupabase } from "@/lib/supabase";

/**
 * Where an App Store purchase becomes a premium subscription.
 *
 * The shell runs Apple's sheet, gets a signed transaction back, and sends the
 * JWS here. Nothing it says is believed: `verifyAppStoreJws` checks the
 * signature against a chain ending at Apple's root before a single field is
 * read, because a server action is a public endpoint and the alternative is
 * granting premium to anyone who can POST.
 *
 * ── the transaction is not finished until this returns ──────────────────────
 *
 * `native-iap.ts` deliberately leaves the StoreKit transaction open, and this
 * is the reason. If the grant does not land — a dead network, a deploy, a
 * crash — StoreKit keeps redelivering the purchase and
 * `nativeUnfinishedTransactions()` replays it on the next launch. Money taken
 * with no grant is the one outcome a payment path must not be able to reach
 * quietly, so `finish` happens only after this says yes.
 *
 * That makes replay the normal case rather than an edge one, so every write
 * here is an upsert keyed on the store's own subscription id and every value
 * comes from the signed payload. Submitting the same transaction ten times
 * produces one row and the same row.
 */

export type IapResult =
  | { readonly ok: true; readonly premium: boolean }
  | { readonly ok: false; readonly reason: "unverified" | "not_yours" | "unbound" | "failed" };

/**
 * Verifies one signed transaction and records what it entitles.
 *
 * Returns `premium: false` for a transaction that is genuine but spent — an
 * expired or refunded one is a true answer, not an error, and the shell still
 * needs to finish it or StoreKit will offer it again forever.
 */
export async function submitAppStoreTransaction(jws: string): Promise<IapResult> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  // No redirect. This is called from a purchase flow rather than a page, and
  // bouncing a signed-out caller to /sign-in would lose the transaction.
  if (!auth.user) return { ok: false, reason: "not_yours" };

  let transaction: AppStoreTransaction;
  try {
    transaction = verifyAppStoreJws(jws);
  } catch (cause) {
    // §9.6 — the reason, never the payload. A rejected JWS is still a receipt.
    console.error(
      JSON.stringify({
        at: "iap.verify",
        problem: cause instanceof JwsError ? cause.message : "unknown",
      }),
    );
    return { ok: false, reason: "unverified" };
  }

  /**
   * The purchase has to name the member who made it.
   *
   * `appAccountToken` is sent at purchase and travels inside every future
   * renewal and server notification, which is the only thing that makes a
   * subscription belong to a Plus One account rather than to an Apple ID.
   * Without it there is nothing to bind and the honest answer is to refuse:
   * guessing "probably whoever is signed in" is how one Apple ID unlocks
   * several members, and it would guess right often enough to look fine.
   *
   * Compared case-insensitively. Apple round-trips it as a UUID and does not
   * promise the case it came in with; Postgres stores ours lowercase. A
   * case-sensitive compare here fails for every real purchase and for no
   * fraudulent one.
   */
  const token = transaction.appAccountToken;
  if (!token) return { ok: false, reason: "unbound" };
  if (token.toLowerCase() !== auth.user.id.toLowerCase()) {
    console.error(JSON.stringify({ at: "iap.binding", problem: "token names another member" }));
    return { ok: false, reason: "not_yours" };
  }

  const now = Date.now();
  const status = entitlementStatusOf(transaction, now);

  // Service role, because iap_entitlements grants members SELECT and nothing
  // else — the same shape as subscriptions, which only the Stripe webhook
  // writes. A member being able to write their own entitlement would make every
  // check above decorative.
  const { error } = await serviceClient()
    .from("iap_entitlements")
    .upsert(
      {
        user_id: auth.user.id,
        store: "apple",
        product_id: transaction.productId,
        transaction_id: transaction.originalTransactionId,
        status,
        // From the signed payload, never from a clock. A replayed transaction
        // must not be able to extend anybody's subscription, which is the same
        // rule the Stripe webhook follows with current_period_end.
        expires_at: transaction.expiresDate
          ? new Date(transaction.expiresDate).toISOString()
          : null,
        environment: transaction.environment ?? null,
      },
      // NOT user_id. The trigger would refuse it anyway — that is the point of
      // 20260826000100 — but writing it here would make the refusal a 500 on a
      // purchase rather than a line that was never written.
      { onConflict: "store,transaction_id" },
    );

  if (error) {
    // Includes the binding trigger firing, which means this store subscription
    // already belongs to somebody else. Nothing to do about it here except be
    // honest; re-binding is the failure it exists to prevent.
    console.error(JSON.stringify({ at: "iap.record", problem: error.message }));
    return { ok: false, reason: "failed" };
  }

  revalidatePath("/app/settings/premium");
  return { ok: true, premium: status === "active" };
}

/**
 * The launch pass over whatever StoreKit is still redelivering.
 *
 * Submitted one at a time rather than in a batch: they are independent
 * purchases, one being unverifiable says nothing about the next, and the shell
 * finishes each on its own answer.
 */
export async function submitAppStoreTransactions(jwsList: string[]): Promise<IapResult[]> {
  const results: IapResult[] = [];
  for (const jws of jwsList) results.push(await submitAppStoreTransaction(jws));
  return results;
}
