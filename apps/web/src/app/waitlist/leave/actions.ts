"use server";

import { leaveWaitlist } from "@/lib/waitlist";

/**
 * A POST, and that is the whole point of it existing as an action.
 *
 * Mail clients, link scanners and chat previews issue GETs on their own. If
 * leaving were a GET, a prefetched footer link would quietly remove somebody
 * who never clicked — and they would never find out, because the only evidence
 * is an email that stops arriving. RFC 8058 makes one-click unsubscribe a POST
 * for this exact reason.
 *
 * Returns nothing. The page renders the same confirmation whether the token
 * matched a row or matched nothing, because the alternative tells whoever holds
 * the link whether that address was on a list for an HSV and HIV app.
 */
export async function leave(formData: FormData): Promise<void> {
  await leaveWaitlist(String(formData.get("t") ?? ""));
}
