"use server";

import { getServerSupabase } from "@/lib/supabase";
import type { Hit, LookupState } from "./state";

/**
 * Member lookup (§7.3), as a POST rather than a query string.
 *
 * The form used `method="get"`, which put whatever a moderator typed into
 * `?q=` — so searching for a member by name wrote that name into our own
 * access logs, the moderator's browser history, and the Referer of anything the
 * page linked out to. §9.6 says logs carry opaque ids only, and a display name
 * is not an opaque id. It is the same mistake the room slugs made, on the one
 * screen whose entire purpose is looking up individual people.
 *
 * The trade is that a search is no longer a linkable URL. On a moderation tool
 * that is the point.
 */
export async function lookupMembers(
  _previous: LookupState,
  formData: FormData,
): Promise<LookupState> {
  const query = String(formData.get("q") ?? "").trim();
  if (query.length < 2) return { hits: [], searched: false };

  const supabase = await getServerSupabase();
  const { data } = await supabase.rpc("admin_member_lookup", { p_query: query });

  return { hits: (data ?? []) as Hit[], searched: true };
}
