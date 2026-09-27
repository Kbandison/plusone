"use client";

import { useEffect } from "react";

import { ACTIVITY_PING_STORAGE_KEY } from "@plusone/config";

import { pingActivity } from "./activity-actions";

interface PingEnv {
  /** Whether the page is on screen right now. */
  readonly visible: () => boolean;
  /** localStorage, fetched lazily because even READING it can throw. */
  readonly storage: () => Pick<Storage, "getItem" | "setItem">;
  /** The UTC day, as the server stamps it. */
  readonly today: () => string;
  readonly ping: () => Promise<void>;
}

/**
 * The decision, apart from React so it can be tested with fakes: ask only when
 * visible, at most once per UTC day per device, and remember the day only once
 * the server has answered — a failed ping must be retried on the next visit,
 * not written off.
 */
export function activityPinger(env: PingEnv): () => void {
  return () => {
    if (!env.visible()) return;
    const today = env.today();
    try {
      if (env.storage().getItem(ACTIVITY_PING_STORAGE_KEY) === today) return;
    } catch {
      // Storage refused (a private window, cleared site data). Ask anyway;
      // the server's own once-a-day throttle keeps that free.
    }
    void env.ping().then(
      () => {
        try {
          env.storage().setItem(ACTIVITY_PING_STORAGE_KEY, today);
        } catch {
          // Nothing to do: tomorrow's visit asks again either way.
        }
      },
      () => {},
    );
  };
}

/**
 * Tell the server this member was here today — when the app becomes visible,
 * not only when a page loads. Renders nothing.
 *
 * The TWA and the iOS shell come back from the background without a page load,
 * so the layout's own recording never runs for a member who keeps the app in
 * the background and returns to it daily — review found exactly that.
 * `visibilitychange` is what both engines fire when it happens.
 *
 * What is remembered on the device is the day it last asked, nothing about
 * what the member did.
 */
export function ActivityPing() {
  useEffect(() => {
    const run = activityPinger({
      visible: () => document.visibilityState === "visible",
      storage: () => window.localStorage,
      today: () => new Date().toISOString().slice(0, 10),
      ping: pingActivity,
    });
    run();
    document.addEventListener("visibilitychange", run);
    return () => document.removeEventListener("visibilitychange", run);
  }, []);

  return null;
}
