"use server";

import { redirect } from "next/navigation";

import { getServerSupabase } from "@/lib/supabase";

/**
 * Records where this device can be reached.
 *
 * A thin wrapper on register_push_device, which does the interesting part: it
 * upserts on the endpoint, so a browser that re-subscribes updates rather than
 * conflicts, and a phone that changed hands follows whoever is signed in now.
 */
export async function registerPushDevice(subscription: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<{ ok: boolean }> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const { error } = await supabase.rpc("register_push_device", {
    p_endpoint: subscription.endpoint,
    p_p256dh: subscription.p256dh,
    p_auth: subscription.auth,
    p_platform: "web",
  });

  if (error) {
    // §9.6 — the endpoint is a device identifier and never goes in a log.
    console.error(JSON.stringify({ at: "push.register", problem: error.message }));
    return { ok: false };
  }
  return { ok: true };
}

/**
 * Forgets this device.
 *
 * Deletes through the member's own client rather than the service role, so RLS
 * checks it is theirs — the policy is `user_id = auth.uid()`. The service-role
 * version exists for a dead endpoint the push service reported, which is a
 * different act by a different caller.
 */
export async function unregisterPushDevice(endpoint: string): Promise<{ ok: boolean }> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);

  if (error) {
    console.error(JSON.stringify({ at: "push.unregister", problem: error.message }));
    return { ok: false };
  }
  return { ok: true };
}
