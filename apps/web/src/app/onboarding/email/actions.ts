"use server";

import { redirect } from "next/navigation";

import { DRAFT_COPY, parseClientEnv } from "@plusone/config";
import { verification } from "@plusone/logic";

import { STEP_ROUTES, nextRoute } from "@/lib/step-routes";
import { getServerSupabase } from "@/lib/supabase";

import type { BackupEmailState } from "./state";

const E = DRAFT_COPY.app.emailErrors;
const codeInvalid = DRAFT_COPY.phone.errors.codeInvalid;

/**
 * Put an address on the account and send a code to it.
 *
 * The same rule and the same Supabase call as Settings' addSignInEmail —
 * canAddSignInEmail, then updateUser({ email }) — because it is the same act:
 * a member adding a second way in to their own account. The difference is
 * WHEN. Settings sits behind the onboarding gate, so until this screen a member
 * who stalled at the face check had no way to give us an address at all.
 *
 * Confirmed by a CODE typed here, not by the link in the same email. A link
 * opens wherever the phone opens links — Safari, on iOS, which is not the app's
 * cookie jar — and the PKCE exchange behind it only completes in the browser
 * that asked. A code works in both engines because it never leaves the screen.
 */
export async function sendBackupEmailCode(
  _prev: BackupEmailState,
  formData: FormData,
): Promise<BackupEmailState> {
  const raw = String(formData.get("email") ?? "");
  if (!raw.trim()) return { error: E.required, sentTo: null };

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(STEP_ROUTES.phone);

  const decision = verification.canAddSignInEmail(raw, {
    phoneConfirmed: Boolean(auth.user.phone_confirmed_at),
    currentEmail: auth.user.email ?? null,
  });
  if (!decision.ok) {
    const error =
      decision.code === "phone_not_confirmed"
        ? E.phoneNotConfirmed
        : decision.code === "email_unchanged"
          ? E.unchanged
          : E.invalid;
    return { error, sentTo: null };
  }

  const env = parseClientEnv(process.env);
  const { error } = await supabase.auth.updateUser(
    { email: decision.email },
    // For the link in the same email, which some will tap anyway. It lands on
    // the resolver, which sends them to whichever step they are on.
    { emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/onboarding` },
  );

  if (error) {
    // The mapping Settings uses, for the reasons written there: "taken" is the
    // one worth naming, and an undeliverable address will never work on retry.
    if (error.code === "email_exists" || error.code === "user_already_exists") {
      return { error: E.taken, sentTo: null };
    }
    if (error.code === "email_address_invalid") return { error: E.invalid, sentTo: null };
    return { error: E.failed, sentTo: null };
  }

  return { error: null, sentTo: decision.email };
}

/**
 * Check the code, then carry on to the face check.
 *
 * The address is read from the SERVER — `new_email`, which Supabase holds
 * while a change is pending — and never from `prev`. useActionState sends the
 * previous state up from the browser, so `prev.sentTo` is only ever something
 * to show the member, not something to verify against.
 */
export async function confirmBackupEmail(
  prev: BackupEmailState,
  formData: FormData,
): Promise<BackupEmailState> {
  const token = String(formData.get("code") ?? "").replace(/\s+/g, "");

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(STEP_ROUTES.phone);

  const pending = auth.user.new_email;
  if (!pending) {
    // Nothing pending can mean it is already DONE: the same email carries a
    // button, and tapping it confirms the address on the server. Review found
    // this returned "We could not save that" for an address that had just
    // been saved. An account holding a confirmed address has what this screen
    // was for, so it carries on.
    if (auth.user.email && auth.user.email_confirmed_at) redirect(nextRoute("phone"));
    return { error: E.failed, sentTo: null };
  }
  if (!token) return { error: codeInvalid, sentTo: prev.sentTo };

  const { error } = await supabase.auth.verifyOtp({ email: pending, token, type: "email_change" });
  if (error) return { error: codeInvalid, sentTo: prev.sentTo };

  // On to the step after the phone, which is where this screen sits. Never
  // back to "/onboarding" — Continue advances, it does not resolve.
  redirect(nextRoute("phone"));
}
