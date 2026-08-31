"use server";

import { revalidatePath } from "next/cache";

import { leaveWaitlist, updatePreferences } from "@/lib/waitlist";

/**
 * Change the area, or change their mind about testing.
 *
 * Keyed on the token, so it needs no sign-in and cannot be aimed at anybody
 * else's row — the same proof leaving uses. Returns nothing: a caller must not
 * be able to learn whether a token was real.
 */
export async function save(formData: FormData): Promise<void> {
  const token = String(formData.get("t") ?? "");
  const metro = String(formData.get("metro") ?? "");
  await updatePreferences(token, {
    // Omitted rather than passed as undefined — exactOptionalPropertyTypes
    // treats those as different, and the second is a type error.
    ...(metro ? { metro } : {}),
    wantsBeta: formData.get("beta") === "on",
  });
  revalidatePath("/waitlist/manage");
}

/** Still a POST, and still for the prefetch reason. See waitlist/leave/actions.ts. */
export async function leave(formData: FormData): Promise<void> {
  await leaveWaitlist(String(formData.get("t") ?? ""));
}
