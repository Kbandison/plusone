"use server";

import { cookies } from "next/headers";
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
  const { error } = await supabase.auth.signOut();

  // The result is not discarded, because signOut can fail WITHOUT clearing the
  // session. auth-js reads the session first and returns early on any error
  // that is not AuthSessionMissingError — before removeCurrentSession() is
  // reached. A network blip while signing out therefore left the cookies in
  // place, and this function redirected to "/" as though the member had left
  // the device. On this app, on a phone someone just handed to a friend, that
  // is the worst possible lie to tell.
  //
  // So the cookies are cleared here regardless. A Server Action may write them,
  // and a session Supabase still believes in is useless without the cookie that
  // carries it.
  if (error) {
    const store = await cookies();
    for (const cookie of store.getAll()) {
      if (cookie.name.startsWith("sb-")) store.delete(cookie.name);
    }
    console.error(JSON.stringify({ at: "auth.signOut", problem: error.message }));
  }

  redirect("/");
}
