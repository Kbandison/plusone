"use server";

import { cookies } from "next/headers";

import { DRAFT_COPY, parseInviteCode } from "@plusone/config";

import { BETA_COOKIE, BETA_COOKIE_OPTIONS } from "@/lib/beta-cookie";
import { betaInviteIsOpen } from "@/lib/waitlist";
import type { InviteCodeState } from "./state";

/**
 * Attach an invitation by typing its code (BACKLOG 32).
 *
 * Does exactly what opening `/beta/<code>` does — sets the invitation cookie —
 * but in whichever app or browser the person is signing up in. That is the
 * whole fix: on an iPhone the email link opens Safari, the installed app keeps
 * its own cookies, and nobody who signed up in the app was ever marked.
 *
 * Nothing is spent or stamped here. verifyCode in ./actions.ts reads the cookie
 * after the OTP and spends the invitation exactly as it does for a followed
 * link, so there is one path to the beta mark, not two.
 *
 * Checked BEFORE the cookie is set, unlike the proxy: the proxy only carries a
 * value from a URL, but a person who typed something is owed an answer now,
 * not a silent failure at the end of signup. One answer for malformed,
 * unknown, used and expired, as on the /beta page.
 */
export async function attachInviteCode(
  _prev: InviteCodeState,
  formData: FormData,
): Promise<InviteCodeState> {
  const code = parseInviteCode(String(formData.get("invite_code") ?? ""));
  if (!code || !(await betaInviteIsOpen(code))) {
    return { attached: false, error: DRAFT_COPY.phone.inviteInvalid };
  }

  (await cookies()).set(BETA_COOKIE, code, BETA_COOKIE_OPTIONS);
  return { attached: true, error: null };
}
