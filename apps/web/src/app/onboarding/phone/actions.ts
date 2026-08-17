"use server";

import { redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";
import { verification } from "@plusone/logic";

import { serviceClient } from "@/lib/cron";
import { getServerSupabase } from "@/lib/supabase";
import type { PhoneState } from "./state";

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

  const supabase = await getServerSupabase();
  const { error } = await supabase.auth.signInWithOtp({ phone });

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
      // A brand-new member has no account yet, so the enumeration concern that
      // makes /sign-in pretend does not apply here — there is nothing to hide.
      case "pretend_sent":
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

  redirect("/onboarding");
}
