import { DRAFT_COPY } from "@plusone/config";

import { registerPushDevice } from "@/app/app/push-actions";
import { inNativeShell, nativePlatform } from "@/lib/native-shell";
import { registerForNativeToken, requestNativePush } from "@/lib/native-push";

/**
 * Turning push on, in the one way this app does it.
 *
 * Extracted from `push-toggle.tsx` on 2026-09-20, when the notification nudge
 * on the Drop became a second caller. Kevin asked for the switch to happen in
 * the card rather than sending somebody to Settings, and duplicating sixty
 * lines of subscription machinery — the VAPID conversion, the two-key read, the
 * unsubscribe-on-failure cleanup — is how one copy gets a fix and the other
 * does not.
 *
 * ── it is still only ever called from a press ──────────────────────────────
 *
 * The rule push-toggle states has not moved: no automatic prompt, because
 * "dismissing it on iOS or Firefox is permanent for the origin — there is no
 * second ask". This function ASKS. Nothing may call it on mount, on render, or
 * from an effect, and both callers put it behind a button with the privacy note
 * already on screen.
 */
export type EnablePushOutcome = "on" | "blocked" | "off" | "unsupported" | "failed";

/**
 * VAPID's public key arrives base64url and PushManager wants bytes.
 *
 * Backed by an explicitly allocated ArrayBuffer rather than `Uint8Array.from`:
 * the latter infers `Uint8Array<ArrayBufferLike>`, which is not a `BufferSource`
 * — the DOM types narrowed when ArrayBuffer became generic, and a view over a
 * SharedArrayBuffer cannot be sent to a push service.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** The two keys off a PushSubscription, base64url, which is what the DB stores. */
function keysOf(subscription: PushSubscription): { p256dh: string; auth: string } | null {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  return p256dh && auth ? { p256dh, auth } : null;
}

export async function enablePush(vapidPublicKey: string | null): Promise<EnablePushOutcome> {
  try {
    /**
     * The native shell first, because a WKWebView has the web APIs too and
     * they are the wrong ones there: iOS grants push through the plugin, and a
     * PushManager subscription inside the shell would register a device nobody
     * can reach.
     */
    if (inNativeShell()) {
      const platform = nativePlatform();
      if (platform !== "ios" && platform !== "android") return "unsupported";

      const permission = await requestNativePush();
      if (permission !== "granted") return permission === "denied" ? "blocked" : "off";

      const token = await registerForNativeToken();
      if (!token) return "failed";

      const result = await registerPushDevice({ platform, token });
      return result.ok ? "on" : "failed";
    }

    if (!vapidPublicKey) return "unsupported";

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return permission === "denied" ? "blocked" : "off";

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    const keys = keysOf(subscription);
    if (!keys) return "failed";

    const result = await registerPushDevice({
      platform: "web",
      endpoint: subscription.endpoint,
      ...keys,
    });
    if (!result.ok) {
      // The browser is subscribed and we cannot reach it, which is worse than
      // not being subscribed: the member sees "on" and never hears anything.
      await subscription.unsubscribe();
      return "failed";
    }
    return "on";
  } catch {
    return "failed";
  }
}

/** What to say for an outcome that is not "on". */
export function enablePushError(outcome: EnablePushOutcome): string | null {
  return outcome === "on" || outcome === "off" ? null : DRAFT_COPY.app.pushFailed;
}
