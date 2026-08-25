import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The iOS shell.
 *
 * Android gets a Trusted Web Activity and iOS gets this, for the reasons the
 * 2026-08-24 entry sets out: a TWA is real Chrome, so Android stays on the
 * engine already tested against, and the unfamiliar runtime is confined to the
 * one platform that has no alternative. This file configures that runtime.
 * Nothing here is shared with Android — see AGENTS.md.
 *
 * WHAT THIS SHELL ACTUALLY IS, stated plainly because the shape is unusual and
 * the alternative is somebody discovering it during review: it loads the live
 * site into a WKWebView. It does not bundle the app. It cannot — `apps/web` is
 * server-rendered Next.js with server actions and a cookie-bound Supabase
 * session, and `next build` has no static export that would survive being
 * served off the filesystem. `webDir` below holds one offline page and nothing
 * else.
 *
 * Capacitor's own declarations mark `server.url` "not intended for use in
 * production", and that warning is aimed squarely at this. It is worth reading
 * as what it is — a caution about App Store review (guideline 4.2, minimum
 * functionality) rather than a technical limit. The mitigation is that the
 * shell earns its native capability: APNs push, the camera the liveness check
 * needs, the badge. None of that is wired yet, which is why the store risk is
 * recorded in PROJECT_UPDATES rather than treated as handled.
 */

/**
 * The origin the shell loads.
 *
 * `www`, not the apex, and that is not a typo. `https://loveplusone.app` answers
 * 308 to `https://www.loveplusone.app/`, so the apex is not where the app is.
 * It matters more here than in a browser: Capacitor opens any navigation
 * outside `server.url`'s host in the SYSTEM browser, so pointing this at the
 * apex would bounce a member out to Safari on the launch navigation — before
 * they ever saw the app. The apex is in `allowNavigation` for the same reason:
 * a link written against it must stay inside the shell.
 *
 * NEXT_PUBLIC_SITE_URL is set to the apex, which is the other half of the same
 * mismatch and is a web-side question — see PROJECT_UPDATES.
 *
 * CAP_SERVER_URL overrides it for local work. Note that a plain-http dev server
 * needs an ATS exception this project deliberately does not ship, so the
 * override is only useful against an https origin (a tunnel, or a preview
 * deployment).
 */
const SERVER_URL = process.env["CAP_SERVER_URL"] ?? "https://www.loveplusone.app";

const config: CapacitorConfig = {
  /**
   * Reverse-DNS of the domain, confirmed by Kevin 2026-08-25. Permanent once
   * the App Store record exists — a bundle id cannot be changed afterwards,
   * only abandoned along with the listing, the reviews and the subscribers.
   */
  appId: "app.loveplusone",
  /**
   * The home-screen name, and deliberately the same string the installed web
   * app uses — BRAND.deviceNameFallback, not BRAND.deviceName. Two names for
   * one app on one phone is how a member ends up with both installed and no
   * idea which is which. The superscript in "⁺One" is also U+207A, which not
   * every launcher font draws.
   */
  appName: "PlusOne",
  webDir: "public",
  server: {
    url: SERVER_URL,
    allowNavigation: ["loveplusone.app"],
    /**
     * What the member sees when the site cannot be reached, instead of
     * WKWebView's own blank page with a webkit error string on it. The whole
     * app is remote, so this is not an edge case — it is every tunnel, every
     * lift, and every deploy that goes wrong.
     */
    errorPath: "index.html",
  },
  ios: {
    /**
     * Explicit, and load-bearing rather than decorative.
     *
     * `never` is already Capacitor's default, but it is the single setting that
     * decides whether the safe-area work in `apps/web` is correct or doubled.
     * Anything else lets UIKit add its own inset for the notch and the home
     * indicator on top of the `env(safe-area-inset-*)` padding the CSS already
     * applies — so the bottom nav would float a home indicator's height above
     * where it belongs, and nothing about the CSS would look wrong. Written
     * down so a later change to it is a decision rather than an accident.
     */
    contentInset: "never",
    /**
     * Dusk's ground, matching the manifest's background_color. It is what
     * shows in the moment between the launch image and the first paint of a
     * remote page — the whole point of picking it is that a white flash before
     * a dark app is the cheapest way to look broken.
     */
    backgroundColor: "#14110f",
  },
};

export default config;
