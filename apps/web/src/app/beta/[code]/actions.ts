"use server";

import { betaInviteIsOpen, recordStoreAccount } from "@/lib/waitlist";

/**
 * Record which store account a tester installs with.
 *
 * The invitation code is the authorisation and it is re-checked here rather
 * than trusted from the form. Without that, this action would be an unauthed
 * write keyed on a value the browser supplies — anybody could set the store
 * address on any row whose code they guessed, and the codes are the same thing
 * the beta gate accepts.
 *
 * Returns nothing either way. A caller cannot learn whether a code was real.
 */
export async function saveStoreAccount(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "");
  if (!(await betaInviteIsOpen(code))) return;

  const platform = String(formData.get("platform") ?? "");
  if (platform !== "ios" && platform !== "android") return;

  await recordStoreAccount(code, platform, String(formData.get("storeEmail") ?? ""));
}
