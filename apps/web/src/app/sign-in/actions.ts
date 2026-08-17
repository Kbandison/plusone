"use server";

import { redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";
import { verification } from "@plusone/logic";

import { getServerSupabase } from "@/lib/supabase";
import type { SignInState } from "./state";

const E = DRAFT_COPY.signIn.errors;

/**
 * Sending a code to a member who already exists.
 *
 * The difference from `/onboarding/phone` is `shouldCreateUser: false` on both
 * branches. This screen can never mint an account — which is what keeps the
 * phone the only thing that makes a member (see packages/logic sign-in.ts), and
 * is also why the email branch is safe to offer at all.
 *
 * The other difference is what happens when that refusal comes back. See
 * classifySendFailure: an identifier holding no account has to produce exactly
 * the screen an identifier holding one produces, because the question this
 * screen would otherwise answer is "is this person on an HSV/HIV app".
 */
export async function sendSignInCode(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const raw = String(formData.get("identifier") ?? "").trim();
  if (!raw) return { error: E.identifierRequired, sentTo: null };

  const identifier = verification.classifyIdentifier(raw, verification.normalizePhone);
  if (!identifier) return { error: E.identifierInvalid, sentTo: null };

  const supabase = await getServerSupabase();
  const { error } =
    identifier.method === "email"
      ? await supabase.auth.signInWithOtp({
          email: identifier.value,
          options: { shouldCreateUser: false },
        })
      : await supabase.auth.signInWithOtp({
          phone: identifier.value,
          options: { shouldCreateUser: false },
        });

  if (error) {
    switch (verification.classifySendFailure(error.code)) {
      case "pretend_sent":
        // No account here. Say what we would have said if there were one.
        return { error: null, sentTo: identifier };
      case "not_configured":
        return { error: E.notConfigured, sentTo: null };
      case "rate_limited":
        return { error: E.rateLimited, sentTo: null };
      case "failed":
        return { error: E.sendFailed, sentTo: null };
    }
  }

  return { error: null, sentTo: identifier };
}

/**
 * A wrong code and a code that was never sent fail identically, which is the
 * far end of the same property: the member who typed an address nobody holds
 * gets "that code is not right", the same as anyone who mistypes.
 *
 * Nothing here touches verification_status. This is a member who already proved
 * whatever they proved; signing back in re-proves nothing and must not appear
 * to. `/onboarding` sorts out where they belong.
 */
export async function verifySignInCode(
  previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const identifier = previous.sentTo;
  if (!identifier) return { error: E.identifierRequired, sentTo: null };

  const token = String(formData.get("code") ?? "").trim();
  if (!token) return { error: E.codeRequired, sentTo: identifier };

  const supabase = await getServerSupabase();
  const { error } =
    identifier.method === "email"
      ? await supabase.auth.verifyOtp({ email: identifier.value, token, type: "email" })
      : await supabase.auth.verifyOtp({ phone: identifier.value, token, type: "sms" });

  if (error) return { error: E.codeInvalid, sentTo: identifier };

  redirect("/onboarding");
}
