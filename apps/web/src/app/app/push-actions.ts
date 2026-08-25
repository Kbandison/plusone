"use server";

import { redirect } from "next/navigation";

import { getServerSupabase } from "@/lib/supabase";

/**
 * An address, in one of the two shapes an address comes in.
 *
 * A discriminated union rather than four optional fields, so the impossible
 * combinations cannot be written: a web subscription without its keys is
 * undeliverable, and a native token carrying keys is a confusion about what the
 * token is. push_subscriptions says the same thing in SQL —
 * `platform <> 'web' or (p256dh is not null and auth is not null)` — and this
 * is that constraint expressed where the caller can see it.
 *
 * `token` rather than `endpoint` for the native side because it is not a URL.
 * The column is shared and the migration's comment says why: "A web push
 * endpoint URL, or a native device token." Unique across members either way, so
 * a shared phone follows whoever signed in last.
 */
export type DeviceAddress =
  | { platform: "web"; endpoint: string; p256dh: string; auth: string }
  | { platform: "ios" | "android"; token: string };

/**
 * Records where this device can be reached.
 *
 * A thin wrapper on register_push_device, which does the interesting part: it
 * upserts on the endpoint, so a browser that re-subscribes updates rather than
 * conflicts, and a phone that changed hands follows whoever is signed in now.
 *
 * Took a web subscription and nothing else until 2026-08-25 — it hard-coded
 * `p_platform: "web"` and demanded both keys, so an APNs or FCM token could not
 * be stored at all. The RPC has always accepted a platform and the table has
 * always allowed the keys null for a native row; only this function could not
 * say it. A notifier for either store would have been sending to an empty set.
 */
export async function registerPushDevice(address: DeviceAddress): Promise<{ ok: boolean }> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const { error } = await supabase.rpc("register_push_device", {
    // Null, not omitted. The RPC's parameters have no defaults but the columns
    // are nullable, and a missing key would send `undefined` where PostgREST
    // wants an explicit null.
    p_endpoint: address.platform === "web" ? address.endpoint : address.token,
    p_p256dh: address.platform === "web" ? address.p256dh : null,
    p_auth: address.platform === "web" ? address.auth : null,
    p_platform: address.platform,
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
