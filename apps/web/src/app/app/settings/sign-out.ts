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
 *
 * ── scope: "local", and the default was wrong ───────────────────────────────
 *
 * `signOut()` with no options defaults to GLOBAL in supabase-js, which revokes
 * every session the member has on every device. So the sentence directly above
 * — "touches nothing else" — was false, and the copy the member reads promised
 * something the call did not do.
 *
 * The consequence is worse than untidy on this app. The sign-out link sits at
 * the bottom of every onboarding screen precisely so somebody who has just
 * handed their phone to a friend can reach it, and that member is thinking
 * about THIS device. Signing out here also ending the session on their laptop —
 * or on a partner's tablet they share — is a surprise in the direction of
 * losing access, and Kevin saw it as devices logging themselves out.
 *
 * Signing out everywhere is a real thing to want, for a lost phone. It is a
 * different control with a different button, and it does not exist yet.
 */
export async function signOut(): Promise<void> {
  const supabase = await getServerSupabase();
  const { error } = await supabase.auth.signOut({ scope: "local" });

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
