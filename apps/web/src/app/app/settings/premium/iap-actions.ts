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

  /**
   * Through an RPC rather than an upsert, and the reason is exact.
   *
   * PostgREST builds `on conflict do update set` from every column in the
   * payload, and the payload has to carry user_id because the INSERT needs it.
   * So the obvious upsert proposes to rebind the row to whoever submitted it on
   * every replay — and replay is the normal case here, because StoreKit
   * redelivers until a transaction is finished. Nothing went wrong only because
   * the value matched and the trigger from 20260826000100 would have refused it
   * if it had not, which is a backstop doing a seatbelt's job.
   *
   * `record_iap_entitlement` names the columns it updates and user_id is not
   * among them, so a replay moves the term and nothing else. A row already
   * belonging to somebody else is left alone and comes back null.
   *
   * Service role, because the table grants members SELECT and nothing else —
   * a member able to write their own entitlement would make every check above
   * decorative.
   */
  const { data: recorded, error } = await serviceClient().rpc("record_iap_entitlement", {
    p_user_id: auth.user.id,
    p_store: "apple",
    p_product_id: transaction.productId,
    p_transaction_id: transaction.originalTransactionId,
    p_status: status,
    // From the signed payload, never from a clock. A replayed transaction must
    // not be able to extend anybody's subscription, which is the same rule the
    // Stripe webhook follows with current_period_end.
    p_expires_at: transaction.expiresDate ? new Date(transaction.expiresDate).toISOString() : null,
    p_environment: transaction.environment ?? null,
  });

  if (error) {
    console.error(JSON.stringify({ at: "iap.record", problem: error.message }));
    return { ok: false, reason: "failed" };
  }

  /**
   * Null means the subscription is bound to another member.
   *
   * Not an error and not a grant. Somebody restoring a purchase on a second
   * Plus One account gets here honestly — one Apple ID, two accounts — and the
   * right answer is that the subscription stays where it was bought. Saying
   * "not_yours" rather than "failed" is what lets the shell tell them that
   * instead of offering to retry.
   */
  if (recorded === null) {
    console.error(JSON.stringify({ at: "iap.record", problem: "bound to another member" }));
    return { ok: false, reason: "not_yours" };
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
