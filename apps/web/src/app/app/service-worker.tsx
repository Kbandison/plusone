"use client";

import { useEffect } from "react";

import { registerPushDevice } from "./push-actions";

/**
 * Registers the service worker, and nothing else.
 *
 * Inside /app rather than the root layout: the worker exists for push and for
 * the installed shell, both of which are member things, and registering it on
 * the marketing pages would put one on the machine of somebody who has not
 * signed up. Its scope is still "/" — the file is served from the origin root,
 * which is what a scope is decided by — so an installed app that lands on
 * /sign-in is still inside it.
 *
 * Renders nothing and blocks nothing. A failed registration is not worth
 * telling a member about: it costs them notifications, which the settings
 * screen will then report honestly, and there is no action to offer here.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // After load rather than during it. Registration competes with the page's
    // own requests, and on a phone on mobile data the first paint is worth more
    // than a worker that is only needed on the next visit.
    const register = () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((cause) => {
        console.error("service worker registration failed", cause);
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    /**
     * Tells the server whatever address this browser currently holds.
     *
     * A push subscription is not permanent — browsers rotate them, and the
     * worker takes out a new one when they do (see pushsubscriptionchange in
     * sw.js). Nothing was reporting the new address, so the row pointed at a
     * dead endpoint and the device went permanently silent while the settings
     * screen still said "On for this device".
     *
     * Done here, on load, rather than from the worker: that event can fire with
     * no page open and no fresh session, so a worker posting to an
     * authenticated route would be relying on a cookie that may have expired —
     * and failing silently, again.
     *
     * register_push_device is an upsert keyed on the endpoint, so the ordinary
     * case is one write that moves last_seen_at and nothing else. The old row
     * is not deleted here: the browser has already forgotten that endpoint, so
     * there is nothing to unsubscribe, and the next send collects the 410 and
     * removes it.
     */
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then(async (subscription) => {
        if (!subscription) return;
        const keys = subscription.toJSON().keys;
        if (!keys?.p256dh || !keys.auth) return;
        await registerPushDevice({
          platform: "web",
          endpoint: subscription.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        });
      })
      .catch(() => {
        // A member who is signed out, or a browser that refuses. Nothing to
        // tell anybody: this is bookkeeping behind a control that reports its
        // own state from the browser.
      });
  }, []);

  return null;
}
