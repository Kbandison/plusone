"use server";

import { revalidatePath } from "next/cache";

import { MUTABLE_EVENTS, NOTIFICATION_CHANNELS } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";

/**
 * One switch, one channel, one member.
 *
 * The RPC is the wall — it reads auth.uid() itself, checks the channel, and
 * refuses `verification_decided` outright. The two checks here are not a
 * second wall; they stop a malformed call reaching the database at all, so an
 * event name this build does not know about fails as a false rather than as a
 * row nothing will ever read.
 *
 * Absence is the default and only OFF is stored. So turning something back on
 * DELETES the row rather than writing a true — which is what makes a change to
 * NOTIFICATION_DEFAULTS reach everybody who never expressed a preference.
 */
export async function setNotificationMute(
  event: string,
  channel: string,
  muted: boolean,
): Promise<{ ok: boolean }> {
  if (!(MUTABLE_EVENTS as readonly string[]).includes(event)) return { ok: false };
  if (!(NOTIFICATION_CHANNELS as readonly string[]).includes(channel)) return { ok: false };

  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("set_notification_mute", {
    p_event: event,
    p_channel: channel,
    p_muted: muted,
  });

  if (error) return { ok: false };

  revalidatePath("/app/settings/notifications");
  return { ok: true };
}
