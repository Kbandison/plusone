"use server";

import { redirect } from "next/navigation";

import { getServerSupabase } from "@/lib/supabase";

/**
 * Signing out.
 *
 * There was no way to do this. On an app about a stigmatised condition, on a
 * phone someone might hand to a friend to show them a photo, that is not a
 * missing convenience — it is the one control a member reaches for when the
 * room changes. Deletion existed; leaving the device did not.
 *
 * Deliberately not the same thing as deleting: this ends the session and
 * touches nothing else, and the copy says so.
 */
export async function signOut(): Promise<void> {
  const supabase = await getServerSupabase();
  await supabase.auth.signOut();
  redirect("/");
}
