"use server";

import { recordActivity } from "@/lib/last-active";
import { getServerSupabase } from "@/lib/supabase";

/**
 * "I was here today", from a shell that came back without a page load.
 *
 * The layout records a visit on every FULL page load, but the TWA and the iOS
 * shell resume from the background without one — review found a member could
 * open the app every day and never be recorded. ActivityPing calls this when
 * the app becomes visible again.
 *
 * The same writer as the layout, so the same rules: the day and never the
 * moment, at most one effective write a day, the id from the verified session.
 * And the same gate — only a member who has finished onboarding, because
 * nobody else is in visible_profiles to be seen as active.
 */
export async function pingActivity(): Promise<void> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;

  const { data: me } = await supabase
    .from("profiles")
    .select("onboarded_at")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!me?.onboarded_at) return;

  await recordActivity(auth.user.id);
}
