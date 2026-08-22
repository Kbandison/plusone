import type { MetadataRoute } from "next";

import { BRAND } from "@plusone/config";

/**
 * What makes this installable (§8, and the whole reason push can exist on iOS).
 *
 * Safari only delivers web push to a site the member has added to their home
 * screen, and it will only offer that for a page with a manifest. So this file
 * is not polish — it is the precondition for the drop being able to tell
 * anybody it landed on an iPhone.
 *
 * `display: standalone` rather than `fullscreen`: the status bar stays, which
 * is what stops an installed app feeling like it has taken the phone over.
 *
 * No `share_target`, no `shortcuts`. A shortcut into a screen behind a login is
 * a shortcut to a sign-in page, and this app is entirely behind one.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    /**
     * The label under the icon, and the one place the wordmark should NOT go.
     *
     * BRAND anticipates this: deviceName is "⁺One" and deviceNameFallback is
     * "PlusOne", "for platforms that mangle superscripts". A home screen is
     * exactly that platform — U+207A is missing from some launcher fonts, and
     * a member whose phone cannot draw it gets a tofu box beside three letters.
     * A manifest carries one string and cannot fall back, so it takes the one
     * that always renders.
     */
    short_name: BRAND.deviceNameFallback,
    /**
     * Deliberately says nothing about who this is for.
     *
     * A manifest is readable by anything on the device that can list installed
     * apps, and the icon and name sit on a home screen anybody can see over a
     * shoulder. §8 keeps a condition word out of a lock-screen preview; the same
     * argument applies with more force to the app's own name and description.
     */
    description: "Dating and support, one conversation at a time.",
    /**
     * The app's stable identity, separate from where it opens.
     *
     * Without `id`, Chrome identifies an installed app by its start_url — so
     * changing where the app opens would look like a different app, and an
     * already-installed member would be offered the install prompt again for
     * something they have. Pinned to a value that has no reason to move.
     */
    id: "/app",
    start_url: "/app",
    // The scope has to include "/" or a sign-in redirect leaves the installed
    // window and opens a browser tab, which loses the session cookie's context
    // and looks like being signed out.
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    /**
     * One window, however the app is entered.
     *
     * notificationclick already does this for a tapped notification: find the
     * window that is open and navigate it, rather than opening a second copy
     * beside it. Every OTHER way in — the home-screen icon, a link handed to
     * the installed app — never reaches that handler, and the default is a new
     * window. So a member who taps the icon while the app is already running
     * gets two, and the one they were reading is the one underneath.
     *
     * `navigate-existing` rather than `focus-existing`: focusing alone returns
     * them to wherever they left off, which is not where the link pointed.
     * Chromium reads this; everything else ignores it and keeps its own
     * behaviour, which is why notificationclick still does the work by hand.
     */
    launch_handler: { client_mode: "navigate-existing" },
    // Dusk's ground. The splash screen and the status bar tint read from these,
    // and a white flash before a dark app is the cheapest way to look broken.
    background_color: "#14110f",
    theme_color: "#14110f",
    categories: ["social", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android crops to the launcher's own shape and only guarantees the
      // centre 80%. Without a maskable variant it crops the "any" icon and
      // slices the mark.
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
