"use client";

import { useEffect } from "react";

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

  return null;
}
