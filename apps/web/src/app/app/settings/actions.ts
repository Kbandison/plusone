"use server";

import { revalidatePath } from "next/cache";

import { verification } from "@plusone/logic";

import { DRAFT_COPY, parseClientEnv } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";
import { memberFacingError } from "@/lib/rpc-error";
import type { SettingsState } from "./state";

const E = DRAFT_COPY.app.emailErrors;

/**
 * Requesting deletion (§9.3, on the never-cut list).
 *
 * This is a request, not a soft delete: `request_deletion` sets a purge date and
 * the nightly job removes the rows. Nothing here hides the member in the
 * meantime and nothing marks them inactive — the account works normally until
 * it stops existing, because a seven-day limbo where you are invisible but not
 * gone is a worse experience than either.
 *
 * The typed confirmation is not decoration. §3.4's copy says "this cannot be
 * undone — and we mean actually deleted", and a single tap is not consent to
 * something irreversible.
 */
export async function requestDeletion(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  if (
    String(formData.get("confirm") ?? "")
      .trim()
      .toUpperCase() !== "DELETE"
  ) {
    return { error: "Type DELETE to confirm.", message: null };
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("request_deletion");
  if (error)
    return {
      error: memberFacingError(error, "That didn't save. Try again."),
      message: null,
    };

  const purgeAfter = new Date(data as string);
  revalidatePath("/app/settings");
  return {
    error: null,
    message: `Everything will be gone by ${purgeAfter.toLocaleDateString()}.`,
  };
}

export async function setCrossCommunityOptIn(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const optIn = formData.get("cross_community") === "on";

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("profiles")
    .update({ cross_community_opt_in: optIn })
    .eq("id", auth.user!.id);

  if (error) return { error: "That didn't save.", message: null };
  revalidatePath("/app/settings");
  // A checkbox looks identical whether the save landed or not, so silence here
  // is indistinguishable from failure.
  return { error: null, message: "Saved." };
}

/**
 * Adding the second way in.
 *
 * `canAddSignInEmail` is the gate and it refuses on any account without a
 * confirmed phone — which is the property the whole design rests on. An email
 * is free and infinite; a phone number is the one credential that costs a
 * banned member something to replace. So the address attaches to an account a
 * phone already made, and can never make one. (packages/logic sign-in.ts.)
 *
 * `updateUser` sends a confirmation to the new address, and Supabase does not
 * move `email_confirmed_at` until that link is opened — so a typo, or someone
 * else's address typed by mistake, never becomes a way into this account.
 */
export async function addSignInEmail(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const raw = String(formData.get("email") ?? "");
  if (!raw.trim()) return { error: E.required, message: null };

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user!;

  const decision = verification.canAddSignInEmail(raw, {
    phoneConfirmed: Boolean(user.phone_confirmed_at),
    currentEmail: user.email ?? null,
  });

  if (!decision.ok) {
    const message =
      decision.code === "phone_not_confirmed"
        ? E.phoneNotConfirmed
        : decision.code === "email_unchanged"
          ? E.unchanged
          : E.invalid;
    return { error: message, message: null };
  }

  const env = parseClientEnv(process.env);
  const { error } = await supabase.auth.updateUser(
    { email: decision.email },
    // Back to this screen, which is where they will look to see whether it
    // worked. Without it the confirmation drops them on the site root.
    { emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/app/settings` },
  );

  if (error) {
    // The one error worth naming: the address belongs to another account, so
    // no amount of retrying will work and the member needs to know why.
    //
    // This does leak that SOME account holds the address — but only to someone
    // already signed in, typing into their own settings, and the alternative is
    // an unexplained failure on a screen they cannot get past. That is a
    // different trade from /sign-in, where the asker has no account at all.
    if (error.code === "email_exists" || error.code === "user_already_exists") {
      return { error: E.taken, message: null };
    }
    // Well-formed but undeliverable — Supabase rejects addresses at domains it
    // knows bounce, which our own shape check cannot see. Found by probing the
    // live API: an example.com address passes normalizeEmail and comes back
    // `email_address_invalid`. "Try again in a moment" is wrong for it, because
    // trying again will never work.
    if (error.code === "email_address_invalid") {
      return { error: E.invalid, message: null };
    }
    return { error: E.failed, message: null };
  }

  revalidatePath("/app/settings");
  return { error: null, message: DRAFT_COPY.app.emailPending(decision.email) };
}
