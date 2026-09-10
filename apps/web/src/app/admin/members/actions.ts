"use server";

import { getServerSupabase } from "@/lib/supabase";
import type { ContactState, Hit, LookupState } from "./state";

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

/**
 * One member's email and phone, on request.
 *
 * The roster ships masked values, so this is what turns kb***@gmail.com into an
 * address — for the case the roster exists to serve and cannot finish on its
 * own: an account whose display name means nothing to you.
 *
 * No written reason, unlike `revealCondition`. §7.3 prices a diagnosis at a
 * sentence because a diagnosis is the disclosure this app protects; a phone
 * number is not, and charging the same for both would either cheapen that gate
 * or make ordinary administration annoying enough to work around.
 */
export async function memberContact(
  _previous: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { shown: false };

  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("admin_member_contact", { p_user_id: userId });
  if (error) return { shown: false, error: "Could not read that." };

  const row = (data ?? [])[0] as { email: string | null; phone: string | null } | undefined;
  // A non-admin gets an empty set rather than a raise, so an empty result and a
  // refusal look the same from here. That is the intended shape: this screen is
  // already behind is_admin() and a second error message would say nothing new.
  return { shown: true, email: row?.email ?? null, phone: row?.phone ?? null };
}
