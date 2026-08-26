"use client";

import { useEffect } from "react";

import { inNativeShell } from "@/lib/native-shell";

/**
 * The count on the app's own icon, on a home screen or a dock.
 *
 * An installed app is one the member is not looking at. Everything else this
 * product does to say "something happened" needs the app open (the bell) or a
 * notification permission many people will never grant (push) — and for a
 * member who installed it and declined notifications, there was nothing at all.
 * This is the one signal that survives both.
 *
 * ── it used to be a dot, and that was a decision, not an oversight ──────────
 *
 * §8 keeps count granularity out of notifications, and the argument reached an
 * app icon with more force than a lock screen: an icon sits on a home screen
 * indefinitely, in front of whoever picks the phone up, and "7" on an app
 * called ⁺One is a different disclosure from "something". So this called
 * `setAppBadge()` with no argument, and a test enforced it.
 *
 * **Kevin decided the count on 2026-08-26**, which is his call to make and is
 * recorded in `PROJECT_UPDATES.md` with what it trades. What is worth knowing
 * here is that the trade is real and one-directional: a number tells anyone who
 * sees the icon how much is waiting, and the dot never did. If it is ever
 * revisited, the middle option is a bucketed count — a true number up to a
 * threshold and a flat "5+" above it — which is a one-line change to `shown`
 * below and keeps §8's floor while still saying more than a mark.
 *
 * ── three surfaces, and only one of them is a browser ───────────────────────
 *
 * The web and the Android TWA get the Badging API, which is genuinely a browser
 * API. The iOS shell does not have it at all — WKWebView ships no `setAppBadge`
 * — so it goes through `PlusOneShell`, and a badge on an iPhone that came from
 * the App Store exists only because of that branch.
 *
 * Android's launcher badge was the reason the old comment said "what Android
 * actually draws is a 1": a valueless flag is numeric there and comes out as
 * the smallest numeral. Passing a real count makes that platform honest rather
 * than working around it.
 *
 * Unsupported in places it would be nice to have. Safari on iOS grants the web
 * API only to an installed app that has been given notification permission,
 * Firefox has never shipped it, and iOS shows no native badge unless badge
 * authorization was granted with push. So this stays progressive enhancement in
 * the strict sense: everything works without it, and nothing tells anybody it
 * is missing.
 */
interface CapacitorBridge {
  nativePromise?: (plugin: string, method: string, options: unknown) => Promise<unknown>;
}

export function AppBadge({ unread }: { unread: number }) {
  useEffect(() => {
    // Never negative, and never a fraction. Both would be refused by one
    // platform and drawn strangely by another.
    const shown = Math.max(0, Math.trunc(unread));

    if (inNativeShell()) {
      const bridge = (window as Window & { Capacitor?: CapacitorBridge }).Capacitor;
      // Zero clears it; iOS has no separate clear call, which is why there is
      // no branch here the way there is on the web.
      void bridge?.nativePromise?.("PlusOneShell", "setBadge", { count: shown })?.catch(() => {
        // A shell built before this method existed. It keeps whatever badge it
        // had, which is the same outcome as the API being unsupported.
      });
      return;
    }

    if (typeof navigator === "undefined" || !("setAppBadge" in navigator)) return;

    const badge = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };

    // Both calls can reject — an installed app whose permission was withdrawn
    // is the usual reason — and a rejection here must not reach a member who
    // was reading something else.
    void (shown > 0 ? badge.setAppBadge?.(shown) : badge.clearAppBadge?.())?.catch(() => {});
  }, [unread]);

  return null;
}
