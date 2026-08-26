"use client";

import { useEffect } from "react";

import { inNativeShell, nativePlatform } from "@/lib/native-shell";
import { nativePushPermission, registerForNativeToken } from "@/lib/native-push";
import { registerPushDevice } from "./push-actions";

/**
 * Keeps the shell's device token current — and asks the member nothing.
 *
 * A device token is not permanent. iOS reissues one when the app is restored to
 * a new device, reinstalled, or updated, and the old one silently stops
 * delivering. Nothing else would notice: the row in `push_subscriptions` still
 * looks fine, and every send to it succeeds and reaches nobody. So this runs on
 * every load of the app and re-registers, which upserts on the endpoint.
 *
 * IT NEVER PROMPTS. The first version did, and the Simulator showed exactly
 * what that means: the permission alert on top of Tonight's Drop, one second
 * after opening the app, before the member had asked for anything. iOS shows
 * that alert ONCE for the life of an install — a member who declines it can
 * never be asked again from inside the app — so spending it on a cold launch is
 * the single most expensive thing this component could do. The asking belongs
 * to the settings toggle, where the member went looking for it, and where the
 * web path has always asked.
 *
 * So: if permission is already granted, keep the token fresh. Otherwise do
 * nothing at all, quietly.
 */
export function NativePush() {
  useEffect(() => {
    if (!inNativeShell()) return;

    const platform = nativePlatform();
    // Null for a shell reporting a name this app has not heard of. A token
    // stored under a platform the notifier cannot read is worse than no token:
    // push_subscriptions.platform is a closed set, and the send would look fine.
    if (platform !== "ios" && platform !== "android") return;

    let cancelled = false;

    void (async () => {
      const permission = await nativePushPermission();
      if (cancelled || permission !== "granted") return;

      const token = await registerForNativeToken();
      if (cancelled || !token) return;

      // Fire and forget. The action logs its own failure, and there is nothing
      // this component could usefully tell a member who did not ask it to run.
      void registerPushDevice({ platform, token });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
