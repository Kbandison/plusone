"use server";

import { redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";
import { verification } from "@plusone/logic";

import { getServerSupabase } from "@/lib/supabase";

const E = DRAFT_COPY.phone.errors;

export type PhoneState = {
  readonly error: string | null;
  /** Set once a code is in flight, which is what swaps the form to the code step. */
  readonly sentTo: string | null;
};

export const PHONE_INITIAL: PhoneState = { error: null, sentTo: null };

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
    const unconfigured = /provider|not enabled|disabled|unsupported/i.test(error.message);
    return { error: unconfigured ? E.notConfigured : E.sendFailed, sentTo: null };
  }

  return { error: null, sentTo: phone };
}

export async function verifyCode(previous: PhoneState, formData: FormData): Promise<PhoneState> {
  const phone = previous.sentTo;
  if (!phone) return { error: E.phoneRequired, sentTo: null };

  const token = String(formData.get("code") ?? "").trim();
  if (!token) return { error: E.codeRequired, sentTo: phone };

  const supabase = await getServerSupabase();
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });

  // Wrong code and expired code are deliberately one message. Distinguishing
  // them tells someone guessing which half they got right.
  if (error) return { error: E.codeInvalid, sentTo: phone };

  redirect("/onboarding");
}
