"use server";

import { redirect } from "next/navigation";

import { parseClientEnv, parseServerEnv } from "@plusone/config";
import { createServiceSupabase } from "@plusone/db";
import { verification } from "@plusone/logic";

import { getServerSupabase } from "@/lib/supabase";
import { DEV_SIGN_IN_REFUSED, devSignInAllowed } from "./guard";
import type { DevSignInState } from "./state";

/**
 * Signing in without an SMS, in development only.
 *
 * `packages/logic` has had a stub OTP provider since Milestone 2 — tested, with
 * a production guard — and the app never called it. `OTP_PROVIDER=stub` was a
 * legal value that did nothing, because sendCode goes straight to
 * `supabase.auth.signInWithOtp`. So there was no way to see the app at all
 * without a live Twilio account, which is a long wait on business verification
 * for something the whole build sits behind.
 *
 * Wiring the stub in directly does not work: Supabase Auth is what mints the
 * session, so a stub that merely agrees the code is right leaves you with no
 * session and every page bouncing back to the phone step.
 *
 * So this mints a real one. The service key creates a phone-confirmed user,
 * `generateLink` produces a single-use token for it, and `verifyOtp` exchanges
 * that token for genuine session cookies. Everything downstream — RLS, the
 * walls, the onboarding resolver — behaves exactly as it will in production,
 * which is the point: a test path that skips the walls tests nothing.
 *
 * THE GUARDS ARE THE FEATURE. This is a door into any account, so it refuses
 * to run unless the deployment has explicitly said it is a stub deployment AND
 * it is not production. dev-sign-in.test.ts asserts both, because the failure
 * mode here is not a bug, it is a breach.
 */
export async function devSignIn(
  _previous: DevSignInState,
  formData: FormData,
): Promise<DevSignInState> {
  // The guard first, on raw process.env. parseServerEnv validates everything
  // and throws when anything is missing, so putting it first makes a missing
  // Stripe key the reason this refuses — which is true but useless, and it is
  // what broke the Vercel build from the page.
  if (!devSignInAllowed(process.env["NODE_ENV"], process.env["OTP_PROVIDER"] ?? "")) {
    throw new Error(DEV_SIGN_IN_REFUSED);
  }

  const server = parseServerEnv(process.env);

  const raw = String(formData.get("phone") ?? "").trim();
  const phone = verification.normalizePhone(raw);
  if (!phone) return { error: "Needs a full E.164 number, like +15555550100." };

  const { NEXT_PUBLIC_SUPABASE_URL } = parseClientEnv(process.env);
  const service = createServiceSupabase(NEXT_PUBLIC_SUPABASE_URL, server.SUPABASE_SECRET_KEY);

  // A synthetic address, because generateLink needs one and a test member has
  // no real inbox. It is never shown and never sent to.
  const email = `${phone.replace(/\D/g, "")}@dev.invalid`;

  // Create if absent. "Already registered" is the normal case — signing in
  // again as the same test member — so it is not an error here.
  const { error: createError } = await service.auth.admin.createUser({
    phone,
    email,
    // Both confirmed: the point is to arrive past the OTP with the same shape a
    // real member has, so resolveStep sends us to liveness rather than back.
    phone_confirm: true,
    email_confirm: true,
  });
  if (createError && !/already|exists|registered/i.test(createError.message)) {
    return { error: createError.message };
  }

  // generateLink both mints the token AND hands back the user, which is why
  // there is no lookup here any more.
  //
  // There was one, through auth.admin.listUsers(), and it destructured only
  // `data` — so when that call started returning "Database error finding users"
  // with an empty list, the code saw no users and told the member "Could not
  // find or create that test member". An ignored error reported as absence:
  // exactly the shape this session has spent its time removing, written four
  // messages ago by me.
  const { data: link, error: linkError } = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError || !link?.properties?.hashed_token || !link.user) {
    return { error: linkError?.message ?? "Could not mint a session." };
  }

  // A member created by an earlier, broken run may predate phone_confirm.
  // Without this they would land back on the phone step with no way through.
  if (!link.user.phone_confirmed_at) {
    await service.auth.admin.updateUserById(link.user.id, { phone, phone_confirm: true });
  }

  const supabase = await getServerSupabase();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "email",
  });
  if (verifyError) return { error: verifyError.message };

  // The same thing verifyCode records, because this path skips it.
  //
  // phone_confirm on the admin API sets auth.users.phone_confirmed_at, which is
  // what the onboarding resolver reads — but the liveness step reads
  // profiles.verification_status, and without this it stays 'unverified' and
  // the next screen refuses. Anything that stands in for a completed OTP has to
  // leave behind everything a completed OTP leaves behind.
  const { data: signedIn } = await supabase.auth.getUser();
  if (signedIn.user) {
    await service
      .from("profiles")
      .update({ verification_status: "phone_verified" })
      .eq("id", signedIn.user.id)
      .eq("verification_status", "unverified");
  }

  redirect("/onboarding");
}
