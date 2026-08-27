"use server";

import { revalidatePath } from "next/cache";

import { serviceClient } from "@/lib/cron";
import { PlayVerifyError, acknowledgePlayPurchase, verifyPlayPurchase } from "@/lib/play-billing";
import { statusGrants } from "@/lib/subscription-source";
import { getServerSupabase } from "@/lib/supabase";
import type { IapResult } from "./iap-actions";

/**
 * Where a Play purchase becomes a premium subscription.
 *
 * Deliberately the same shape as `submitAppStoreTransaction` — same return
 * type, same rules about when to finish — so the two shells can be reasoned
 * about together and a caller that knows one knows the other. What differs is
 * underneath: Apple's transaction carries its own signature and is verified
 * offline, where a Play `purchaseToken` is opaque and has to be presented to
 * Google before it means anything.
 *
 * ── acknowledgement is Play's version of finishing, and it is ours to do ────
 *
 * Google REFUNDS a subscription that is not acknowledged within 72 hours. Not
 * flagged, not retried: the money goes back and the member silently loses what
 * they bought. Nothing on Apple's side behaves like it.
 *
 * This file first said acknowledgement belonged to the client through the
 * Digital Goods API's `consume()`. That was wrong — ChromeOS's billing guide is
 * explicit that it happens server-side through the Developer API, and
 * `consume()` exists only for one-time products somebody needs to buy again.
 * Left as written, every Android purchase would have refunded itself three days
 * later, with nothing anywhere reporting it.
 *
 * So it happens here, AFTER the entitlement is recorded and never before — the
 * same ordering rule as StoreKit's `finish`. Acknowledging first would tell
 * Google we had honoured something we had not yet written down.
 */

export async function submitPlayPurchase(purchaseToken: string): Promise<IapResult> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, reason: "not_yours" };

  let purchase;
  try {
    purchase = await verifyPlayPurchase(purchaseToken);
  } catch (cause) {
    // §9.6 — the reason, never the token, which identifies somebody's purchase.
    console.error(
      JSON.stringify({
        at: "play.verify",
        problem: cause instanceof PlayVerifyError ? cause.message : "unknown",
      }),
    );
    return { ok: false, reason: "unverified" };
  }

  /**
   * Binding, and why this differs from Apple's.
   *
   * Apple's transaction carries `appAccountToken`, put there at purchase, so
   * the JWS itself names the member and a mismatch is refusable. Play's
   * equivalent is `obfuscatedExternalAccountId`, and the Digital Goods API —
   * which is all a TWA has — exposes no way to set it. So for a purchase made
   * through the TWA this comes back null, and there is nothing in the payload
   * naming anybody.
   *
   * What binds it instead is that this action is AUTHENTICATED and
   * `record_iap_entitlement` refuses to move an existing binding. The first
   * member to submit a token owns that subscription permanently; a second one
   * submitting the same token is told it is not theirs. That is weaker than
   * Apple's — it is first-come rather than stated-at-purchase — and it is the
   * strongest thing available while the client cannot set the field.
   *
   * When it IS set, it is checked, so the day a native Android shell can set it
   * this gets stronger without the call site changing.
   */
  if (purchase.accountId && purchase.accountId !== obfuscated(auth.user.id)) {
    console.error(JSON.stringify({ at: "play.binding", problem: "token names another member" }));
    return { ok: false, reason: "not_yours" };
  }

  const { data: recorded, error } = await serviceClient().rpc("record_iap_entitlement", {
    p_user_id: auth.user.id,
    p_store: "google",
    p_product_id: purchase.productId,
    // The token IS the subscription's identity here. Unlike Apple's
    // originalTransactionId it does not survive a tier change — Play issues a
    // new one and points `linkedPurchaseToken` at the old — so an upgrade
    // legitimately produces a second row and the old one expires on its own.
    p_transaction_id: purchaseToken,
    p_status: purchase.status,
    // Google's date, never a clock, so a replayed token cannot extend anybody.
    p_expires_at: purchase.expiresAt,
    // Play's own word for it, kept in the column Apple uses for Sandbox — the
    // question both answer is "did this involve money".
    p_environment: purchase.isTest ? "Sandbox" : "Production",
  });

  if (error) {
    console.error(JSON.stringify({ at: "play.record", problem: error.message }));
    return { ok: false, reason: "failed" };
  }
  if (recorded === null) {
    console.error(JSON.stringify({ at: "play.record", problem: "bound to another member" }));
    return { ok: false, reason: "not_yours" };
  }

  /**
   * Only now, and never before the row exists.
   *
   * A failure here is deliberately NOT fatal to the result: the member has paid
   * and been granted, and turning that into an error would send a client into a
   * retry loop over a subscription that already works. It is logged loudly
   * because the consequence is a refund in 72 hours, and the next verification
   * reads `acknowledged` back so a sweep can find anything that slipped.
   */
  if (!purchase.acknowledged) {
    try {
      await acknowledgePlayPurchase(purchaseToken, purchase.productId);
    } catch (cause) {
      console.error(
        JSON.stringify({
          at: "play.acknowledge",
          problem: cause instanceof PlayVerifyError ? cause.message : "unknown",
        }),
      );
    }
  }

  revalidatePath("/app/settings/premium");
  return { ok: true, premium: statusGrants(purchase.status) };
}

/**
 * What we would put in `obfuscatedAccountId` if we could set it.
 *
 * Google asks for something that is not the raw account identifier, so this is
 * a one-way digest rather than the uuid. Defined here and unused by the TWA
 * path on purpose: it is the value a native Android client would set, and
 * having it in one place means the check above and that future client cannot
 * disagree about what the field should contain.
 */
function obfuscated(userId: string): string {
  // Not a secret and not reversible — it only has to be stable and to avoid
  // handing Google a key into our own database.
  let hash = 0n;
  for (const byte of new TextEncoder().encode(`plusone:${userId}`)) {
    hash = (hash * 31n + BigInt(byte)) % 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}
