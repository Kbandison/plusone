"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getServerSupabase } from "@/lib/supabase";
import { inviteFromWaitlist, nudgeWaitingOnInvitation, remindUnconfirmed } from "@/lib/waitlist";

/**
 * The wall, and why it has to be HERE rather than where the write is.
 *
 * Every other admin action in this app leans on the database: the action
 * carries the form across and `is_admin()` inside the RPC does the refusing,
 * because "the wall belongs where the write is, not where the button is".
 *
 * That is not available to this one. `waitlist` holds no RLS policies and is
 * granted to neither role, so there is no member-context path to it at all —
 * every read and write goes through the service client, which BYPASSES RLS by
 * definition. There is no `is_admin()` behind this to catch a mistake.
 *
 * So the check is here, it is the first thing in the only exported action, and
 * it is a redirect rather than a returned error: a non-admin should never learn
 * that this endpoint does anything.
 */
async function assertAdmin(): Promise<void> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  // No argument — is_admin() answers only about the caller, so the roster
  // cannot be probed. Same call the layout makes; both, because a layout guard
  // stops a page rendering and not a POST arriving.
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/");
}

export async function invite(formData: FormData): Promise<number> {
  await assertAdmin();

  const ids = formData.getAll("id").map(String).filter(Boolean);

  // The override travels with the submission rather than being inferred from
  // which rows came back. Inferring it would mean an unconfirmed id arriving in
  // a POST is itself the permission to send — which is the whole wall, decided
  // by whoever wrote the request.
  const includeUnconfirmed = formData.get("allowUnconfirmed") === "on";
  const sent = await inviteFromWaitlist(ids, { includeUnconfirmed });

  revalidatePath("/admin/waitlist");

  /**
   * HOW MANY, because "Sent." was a lie on 2026-09-20.
   *
   * inviteFromWaitlist has always returned a count and this discarded it, so
   * the screen said the same thing whether it sent twenty-five invitations or
   * none. That is what made a broken override silent: an admin ticked the box,
   * saw the people, pressed the button, was told it had sent, and eighteen
   * invitations were dropped without a word.
   *
   * A count cannot be wrong in that direction. It is the number that actually
   * left, read off the rows the function wrote.
   */
  return sent;
}

/**
 * Ask the unconfirmed ones again.
 *
 * Same wall, first line, for the reason the note above gives — `waitlist` has
 * no RLS to fall back on, so every exported action in this file has to carry
 * its own. A second action is a second door.
 */
export async function remind(formData: FormData): Promise<void> {
  await assertAdmin();

  const ids = formData.getAll("id").map(String).filter(Boolean);
  await remindUnconfirmed(ids);

  revalidatePath("/admin/waitlist");
}

/**
 * Nudge the people holding a code they have not used.
 *
 * Same wall, first line, for the reason at the top of this file: `waitlist` has
 * no RLS to fall back on, so every exported action carries its own.
 *
 * Returns the count for the same reason `invite` does — "Sent." said the same
 * thing for twenty-five invitations and for none, and that is how a dropped
 * override went unnoticed for a day.
 */
export async function nudgeInvited(formData: FormData): Promise<number> {
  await assertAdmin();

  const ids = formData.getAll("id").map(String).filter(Boolean);
  const sent = await nudgeWaitingOnInvitation(ids);

  revalidatePath("/admin/waitlist");
  return sent;
}
