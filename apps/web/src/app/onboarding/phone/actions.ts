"use server";

import { redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";
import { verification } from "@plusone/logic";

import { cookies } from "next/headers";

import { serviceClient } from "@/lib/cron";
import { getServerSupabase } from "@/lib/supabase";
import type { PhoneState } from "./state";
import { nextRoute } from "@/lib/onboarding";
import { acceptBetaInvite, betaInviteIsOpen } from "@/lib/waitlist";

const E = DRAFT_COPY.phone.errors;

/**
 * Supabase Auth is the identity provider — it mints the session, so the OTP
 * round trip has to go through it rather than through our own stub. What the
 * stub in `packages/logic/verification` is for is the pure part: E.164
 * validation and expiry, which are testable without a provider at all.
 *
 * Until the Twilio provider is configured in the Supabase dashboard, `send`
 * fails. That is reported as a setup problem on our side rather than as
 * something the member did wrong, because it is.
 */
export async function sendCode(_previous: PhoneState, formData: FormData): Promise<PhoneState> {
  const raw = String(formData.get("phone") ?? "").trim();
  if (!raw) return { error: E.phoneRequired, sentTo: null };

  // Strips the punctuation people type; refuses to invent a country code,
  // because guessing one sends someone's code to a stranger.
  const phone = verification.normalizePhone(raw);
  if (!phone) return { error: E.phoneInvalid, sentTo: null };

  /**
   * The closed beta gate, and the ONLY place it can live.
   *
   * ── why here and nowhere else ───────────────────────────────────────────────
   *
   * This is the one call in the app that can bring an account into existence.
   * `/sign-in` passes `shouldCreateUser: false` on both branches and says so in
   * its own header — "This screen can never mint an account" — so it is already
   * closed to anybody who is not already a member, and gating it a second time
   * would do nothing except break the anti-enumeration property it was built
   * for.
   *
   * That distinction is the whole design. "Nobody outside the beta gets in" is
   * implemented as "no account can be CREATED without an invitation", not as
   * "nobody can sign in" — and the difference is what stops the gate stranding
   * real people:
   *
   *   an invited stranger      shouldCreateUser: true. Account created.
   *   an EXISTING member       Account already exists, so the OTP sends and
   *                            they sign in, invitation or not. A member whose
   *                            invitation was spent months ago, or who never
   *                            had one because they joined before the beta,
   *                            cannot be locked out of their own account.
   *   a store REVIEWER         The same case. They sign in to an account that
   *                            already exists and is past every one-time gate,
   *                            which is what App Review Information tells them
   *                            to do — so this gate cannot cause the rejection
   *                            it most looks like it would.
   *   an uninvited stranger    No account to sign into and none created. Told
   *                            it is a closed beta, and offered the list.
   *
   * The cookie is a CLAIM and this is where it gets checked. proxy.ts only
   * carries the value; `betaInviteIsOpen` asks the database whether that code
   * was really issued, has not expired, and has not already been spent. Checked
   * on every send rather than once, because a cookie outlives the invitation it
   * names and the browser is not ours.
   */
  const inviteCode = (await cookies()).get("plusone_beta")?.value;
  const invited = await betaInviteIsOpen(inviteCode);

  const supabase = await getServerSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: invited },
  });

  if (error) {
    // The same classifier /sign-in uses, rather than a regex over the provider's
    // own words. Twilio rejects a number it cannot route (error 60200) before
    // sending anything, and that arrives as `sms_send_failed` — for which "try
    // again in a moment" is advice that can never work.
    switch (verification.classifySendFailure(error.code)) {
      case "not_configured":
        return { error: E.notConfigured, sentTo: null };
      case "rate_limited":
        return { error: E.rateLimited, sentTo: null };
      case "undeliverable":
        return { error: E.undeliverable, sentTo: null };
      // `pretend_sent` is Supabase refusing to create an account, which on this
      // screen means exactly one thing: no account exists for this number and
      // `shouldCreateUser` was false. That is the closed beta, and it is the
      // only way this branch can be reached now.
      //
      // Before the gate this was unreachable in practice, and the old comment
      // said so — "a brand-new member has no account yet, so the enumeration
      // concern that makes /sign-in pretend does not apply here". The second
      // half of that is still true and is why this can be answered plainly
      // rather than pretended at: there is nothing to hide about a number with
      // no account when we are refusing every number with no account.
      case "pretend_sent":
        return { error: null, sentTo: null, closed: true };
      case "failed":
        return { error: E.sendFailed, sentTo: null };
    }
  }

  return { error: null, sentTo: phone };
}

export async function verifyCode(previous: PhoneState, formData: FormData): Promise<PhoneState> {
  const phone = previous.sentTo;
  if (!phone) return { error: E.phoneRequired, sentTo: null };

  const token = String(formData.get("code") ?? "").trim();
  if (!token) return { error: E.codeRequired, sentTo: phone };

  const supabase = await getServerSupabase();
  const { error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: "sms",
  });

  // Wrong code and expired code are deliberately one message. Distinguishing
  // them tells someone guessing which half they got right.
  if (error) return { error: E.codeInvalid, sentTo: phone };

  /**
   * Spend the invitation, now that the account it authorised actually exists.
   *
   * AFTER the OTP, never before. Marking it accepted at send time would burn an
   * invitation for anybody who reached the code screen and stopped — a mistyped
   * number, a text that never arrived, a closed tab — and they would have to
   * ask for another one that nothing in the product can issue.
   *
   * Not awaited for its result and not allowed to fail the signup: the account
   * is made either way, and refusing a verified member their session because a
   * bookkeeping update failed would be the worst possible trade. The cost of
   * missing it is one invitation reusable once more, which the TTL still bounds.
   */
  await acceptBetaInvite((await cookies()).get("plusone_beta")?.value);

  // Record on the profile what the OTP just proved.
  //
  // Nothing did this, and the two halves of the app disagreed about it: the
  // onboarding resolver reads auth.users.phone_confirmed_at, while the liveness
  // step reads profiles.verification_status. So every member reached the
  // liveness screen with a profile still marked 'unverified', start_liveness
  // refused with phone_not_verified, and the action reported "unavailable" —
  // which is why liveness had never worked for anyone and looked like a
  // provider problem.
  //
  // Service client because verification_status is no longer in the members'
  // update grant (20260815000800). The condition is the guard: this only ever
  // moves someone off 'unverified', so it can never walk a verified, flagged or
  // rejected member backwards.
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) {
    // The result is checked. It was discarded, and this write is what unlocks
    // step 2 — if it failed, the OTP had still succeeded, so phone_confirmed_at
    // was set, the resolver advanced the member to liveness, and the liveness
    // step read verification_status = 'unverified' and refused with a message
    // about the phone. A member bounced between two screens, each blaming the
    // other, with nothing to press.
    //
    // A zero-row result is NOT a failure: the .eq('unverified') guard means a
    // member who is already phone_verified matches nothing, which is correct
    // and idempotent.
    const { error: promoteError } = await serviceClient()
      .from("profiles")
      .update({ verification_status: "phone_verified" })
      .eq("id", auth.user.id)
      .eq("verification_status", "unverified");

    if (promoteError) {
      console.error(JSON.stringify({ at: "phone.verify", problem: promoteError.message }));
      return { error: E.sendFailed, sentTo: phone };
    }
  }

  redirect(nextRoute("phone"));
}
