"use client";

import { useEffect } from "react";

/**
 * The dot on the app's own icon, on a home screen or a dock.
 *
 * An installed app is one the member is not looking at. Everything else this
 * product does to say "something happened" needs the app open (the bell) or a
 * notification permission that many people will never grant (push) — and for a
 * member who installed it and declined notifications, there was nothing at all.
 * This is the one signal that survives both.
 *
 * A DOT, never a number. setAppBadge() with no argument draws an unadorned
 * mark; with a count it draws the count. §8 rules out count granularity below
 * five, and the argument reaches an app icon with more force than it reaches a
 * lock screen: an icon sits on a home screen indefinitely, in front of whoever
 * picks the phone up, and "7" on an app called ⁺One is a different disclosure
 * from "something". The header badge is a dot for the same reason.
 *
 * What Android actually draws is a "1", and that is not this code losing the
 * argument. A launcher badge on Android has one shape and it is numeric, so a
 * valueless flag — which is all a no-argument call asks for — comes out as the
 * smallest numeral there is. Checked on a real phone against repeated pushes:
 * it stays at 1 and never climbs.
 *
 * Which keeps the part §8 is about. A constant is not a count. "1" says
 * something is waiting and nothing else, so no reader of that icon learns how
 * much — the same sentence a dot speaks, in the only alphabet the platform has.
 * A real total means passing an argument here, and that is a §8 decision about
 * what an app icon may disclose rather than a one-word change to this line.
 *
 * Unsupported almost everywhere it would be nice to have it. Safari on iOS
 * grants it only to an installed app that has been given notification
 * permission; Firefox has never shipped it. So this is progressive enhancement
 * in the strict sense — everything works without it, and nothing tells anybody
 * it is missing.
 */
export function AppBadge({ unread }: { unread: number }) {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("setAppBadge" in navigator)) return;

    const badge = navigator as Navigator & {
      setAppBadge?: () => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };

    // Both calls can reject — an installed app whose permission was withdrawn
    // is the usual reason — and a rejection here must not reach a member who
    // was reading something else.
    void (unread > 0 ? badge.setAppBadge?.() : badge.clearAppBadge?.())?.catch(() => {});
  }, [unread]);

  return null;
}
