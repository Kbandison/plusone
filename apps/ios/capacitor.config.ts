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
 * CAP_SERVER_URL overrides it for local work, and `http://localhost:3000` does
 * work — App Transport Security exempts loopback, so no ATS exception is needed
 * and none is shipped. Verified in the Simulator. A dev server reached by LAN
 * address rather than loopback is a different matter and would need one.
 *
 * Point it at the PATH you want, not just the origin: `http://localhost:3000/app`.
 * The navigation rules below explain why — the fallback rule prefix-matches the
 * whole `server.url` string, so setting it to `/app` keeps every screen under
 * `/app` inside the shell, while setting it to the bare origin and then
 * navigating would leave the prefix behind.
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
    /**
     * Every host this app legitimately navigates to, listed rather than
     * inferred, because both of Capacitor's rules are narrower than they look.
     *
     * `shouldAllowNavigation` splits host and pattern on dots and refuses to
     * compare them unless the counts match — so `loveplusone.app` matches the
     * apex and NOTHING under it. A subdomain has to be named.
     *
     * The fallback rule is `navURL.absoluteString.starts(with: serverURL
     * .absoluteString)` — a prefix test on the WHOLE string, not on the host.
     * It covers `www` today only because `server.url` happens to be exactly the
     * origin with no path. Give that URL a path or a query and every other page
     * on the same host stops matching, and Capacitor hands them to Safari. That
     * is not hypothetical: it is what happened the first time this shell was
     * pointed at an auth callback, and the member was ejected mid-sign-in with
     * no way back. `www` is therefore listed too, so the allowance survives
     * whatever `server.url` is set to.
     *
     * `app.loveplusone.app` used to be here, because NEXT_PUBLIC_APP_URL pointed
     * at it. It is gone because that host is: it never served anything, and on
     * 2026-08-25 both URL variables were pointed at www instead. An allowlist
     * entry for a host that answers nothing is a claim that ages badly — put it
     * back the day something is actually deployed there.
     *
     * Anything NOT on this list still opens in the system browser, which is
     * what should happen to a link out to somewhere this project does not run.
     */
    allowNavigation: ["loveplusone.app", "www.loveplusone.app"],
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
  plugins: {
    /**
     * The keyboard, and why a plugin rather than nothing.
     *
     * Measured in the Simulator on 2026-08-26, against a faithful copy of the
     * chat screen's fixed composer and nav. With no plugin at all iOS DOES
     * resize the web view when the keyboard opens — the composer stays visible
     * and 79px clear, which is the failure this was expected to have and does
     * not. What it does not do is put it back. After the keyboard closed,
     * `window.innerHeight` stayed at 765 against a screen of 874 and never
     * recovered, so the bottom nav sat off the foot of the screen and the
     * composer was clipped by it. The app's only navigation, gone, after one
     * message.
     *
     * `native` is the plugin's default and is named here for the same reason
     * `contentInset` is: it is the setting that decides whether the web view is
     * restored, and a later change to it should be a decision. It resizes the
     * view itself, which keeps `env(safe-area-inset-*)` and the measured
     * `--nav-h` meaning what they mean — `body` and `ionic` resize the document
     * instead and would put the safe-area work back in question.
     */
    Keyboard: {
      resize: "native",
    },
  },
};

export default config;
