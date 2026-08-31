"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getServerSupabase } from "@/lib/supabase";
import { inviteFromWaitlist } from "@/lib/waitlist";

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

export async function invite(formData: FormData): Promise<void> {
  await assertAdmin();

  const ids = formData.getAll("id").map(String).filter(Boolean);
  await inviteFromWaitlist(ids);

  revalidatePath("/admin/waitlist");
}
