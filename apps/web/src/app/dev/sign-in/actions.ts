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
  const server = parseServerEnv(process.env);

  if (!devSignInAllowed(process.env["NODE_ENV"], server.OTP_PROVIDER)) {
    throw new Error(DEV_SIGN_IN_REFUSED);
  }

  const raw = String(formData.get("phone") ?? "").trim();
  const phone = verification.normalizePhone(raw);
  if (!phone) return { error: "Needs a full E.164 number, like +15555550100." };

  const { NEXT_PUBLIC_SUPABASE_URL } = parseClientEnv(process.env);
  const service = createServiceSupabase(NEXT_PUBLIC_SUPABASE_URL, server.SUPABASE_SECRET_KEY);

  // A synthetic address, because generateLink needs one and a test member has
  // no real inbox. It is never shown and never sent to.
  const email = `${phone.replace(/\D/g, "")}@dev.invalid`;

  const { data: created, error: createError } = await service.auth.admin.createUser({
    phone,
    email,
    // Both confirmed: the point is to arrive past the OTP with the same shape a
    // real member has, so resolveStep sends us to liveness rather than back.
    phone_confirm: true,
    email_confirm: true,
  });

  // Already exists is not a failure — signing in again as the same test member
  // is the normal case.
  if (createError && !/already|exists|registered/i.test(createError.message)) {
    return { error: createError.message };
  }

  if (!created?.user) {
    // Find the existing one so a second sign-in works.
    const { data: list } = await service.auth.admin.listUsers();
    const found = list?.users.find((user) => user.phone === phone.replace("+", ""));
    if (!found) return { error: "Could not find or create that test member." };
  }

  const { data: link, error: linkError } = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError || !link?.properties?.hashed_token) {
    return { error: linkError?.message ?? "Could not mint a session." };
  }

  const supabase = await getServerSupabase();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "email",
  });
  if (verifyError) return { error: verifyError.message };

  redirect("/onboarding");
}
