import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The iOS shell's decisions, pinned.
 *
 * Source-reading tests, for the reason CONTRIBUTING.md gives: every constraint
 * below is invisible at runtime until it is a member's problem, and several of
 * them live in files that a tool will happily rewrite. `npx cap add ios` run a
 * second time restores Capacitor's Info.plist over this one and says nothing;
 * Xcode rewrites an asset catalogue whenever it is touched. Nothing else in
 * this repository would notice.
 *
 * These run on Linux in CI, so nothing here may reach for Xcode, a simulator,
 * or a macOS-only tool.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(join(HERE, path), "utf8");

const config = read("capacitor.config.ts");
const plist = read("ios/App/App/Info.plist");
const pbxproj = read("ios/App/App.xcodeproj/project.pbxproj");

/**
 * The contents of one `<array>` in the plist, by the key immediately above it.
 *
 * A plain `.includes()` on the whole file cannot tell the two orientation keys
 * apart — `UISupportedInterfaceOrientations~ipad` is deliberately different
 * from `UISupportedInterfaceOrientations`, and matching the wrong one would
 * make this suite agree with itself no matter which way round they were.
 */
function plistArray(key: string): string[] {
  const match = new RegExp(`<key>${key}</key>\\s*<array>([\\s\\S]*?)</array>`).exec(plist);
  if (!match?.[1]) throw new Error(`No <array> under <key>${key}</key>`);
  return [...match[1].matchAll(/<string>(.*?)<\/string>/g)].map((m) => m[1] ?? "");
}

describe("the origin the shell loads", () => {
  /**
   * The apex answers 308 to www, and Capacitor opens anything outside
   * `server.url`'s host in the SYSTEM browser. Pointed at the apex, the launch
   * navigation itself would eject the member into Safari before they saw the
   * app — and it would look like the shell simply did not work.
   */
  it("is the origin that answers, not the one that redirects", () => {
    // Matched on the HOST, not the whole string. This pinned the URL exactly
    // and so failed when a path was added on 2026-09-01 — a correct change,
    // caught by a test asserting more than its own reason. What matters here is
    // www rather than the apex; where the path points is checked separately.
    const url = /CAP_SERVER_URL"\]\s*\?\?\s*"(https:\/\/[^"]+)"/.exec(config)?.[1] ?? "";
    expect(url, "no default server URL found").not.toBe("");
    expect(new URL(url).host).toBe("www.loveplusone.app");
  });

  /**
   * Both of Capacitor's navigation rules are narrower than they look, and a
   * host missing from this list is not a warning — it is a member ejected into
   * Safari, mid-flow, with the app's cookie jar left behind.
   *
   * `shouldAllowNavigation` compares dot-separated components and refuses a
   * match unless the counts are equal, so the apex pattern covers the apex and
   * nothing beneath it. The fallback is a prefix test on the WHOLE serverURL
   * string rather than on its host, so it stops covering `www` the moment
   * `server.url` grows a path or a query — which is exactly how this was found.
   */
  it("names every host the app navigates to, including the subdomains", () => {
    const hosts = /allowNavigation:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? "";
    expect(hosts).toContain('"loveplusone.app"');
    expect(hosts).toContain('"www.loveplusone.app"');
    // app.loveplusone.app is deliberately absent from 2026-08-25: it never
    // served anything, and both URL variables now point at www. Add it back
    // only if something is actually deployed there.
    expect(hosts).not.toContain('"app.loveplusone.app"');
  });

  /**
   * The whole app is remote, so "cannot reach the site" is not an edge case.
   * Without this WKWebView draws its own blank page with a webkit error on it.
   */
  it("has something to show when the site cannot be reached", () => {
    expect(config).toMatch(/errorPath:\s*"index\.html"/);
    expect(() => read("public/index.html")).not.toThrow();
  });
});

describe("the safe area", () => {
  /**
   * The single setting that decides whether the safe-area work in `apps/web` is
   * right or doubled. Anything but `never` lets UIKit add its own inset for the
   * notch and the home indicator ON TOP of the `env(safe-area-inset-*)` padding
   * the CSS already applies — so the bottom nav floats a home indicator's
   * height above where it belongs, and nothing about the CSS looks wrong.
   *
   * It is also Capacitor's default, which is exactly why it is pinned: a
   * default that nobody wrote down is a default somebody changes.
   */
  /**
   * Measured in the Simulator against a copy of the chat screen, 2026-08-26.
   *
   * With no Keyboard plugin, `env(safe-area-inset-bottom)` stays at 34 while
   * the keyboard is up — so the nav keeps reserving room for a home indicator
   * that is behind the keyboard, and the composer floats 34px above it. That is
   * the exact failure this was on the list to check for. With the plugin the
   * inset drops to 0 while the keyboard is up and returns to 34 after.
   *
   * `native` resizes the web view itself, which keeps `env(safe-area-inset-*)`
   * and the measured `--nav-h` meaning what they mean. `body` and `ionic`
   * resize the document instead and would reopen every safe-area question
   * settled on the 25th.
   */
  it("lets the keyboard put the safe-area inset away while it is up", () => {
    expect(config).toMatch(/Keyboard:\s*\{\s*resize:\s*"native"/);
  });

  it("does not let UIKit inset the webview as well as the CSS", () => {
    expect(config).toMatch(/contentInset:\s*"never"/);
  });

  /**
   * Portrait, and the manifest is the reason. `orientation: "portrait"` has
   * been in manifest.ts since it was written and iOS is the one platform that
   * ignores it, so this is the existing decision reaching the surface it was
   * always meant to cover — not a new one.
   *
   * It is also what keeps the safe-area work honest: everything the app reads
   * is `env(safe-area-inset-bottom)`, nothing anywhere reads `-left` or
   * `-right`, and those are 59pt in landscape on a notched iPhone. Unlocking
   * this without looking at landscape in the Simulator is how that ships
   * unverified.
   */
  it("locks the iPhone to portrait, which is what the manifest has always said", () => {
    expect(plistArray("UISupportedInterfaceOrientations")).toEqual([
      "UIInterfaceOrientationPortrait",
    ]);

    const manifest = read("../web/src/app/manifest.ts");
    expect(manifest).toMatch(/orientation:\s*"portrait"/);
  });

  /**
   * arm64, not the template's armv7 — and this is the only place the reasoning
   * now survives.
   *
   * Capacitor ships Apple's decade-old default. armv7 is 32-bit, no iOS 11
   * device ran it, and the deployment target is 15.0, so the key was either
   * ignored or describing a device that cannot install this.
   *
   * It was explained in a comment in Info.plist until 2026-08-25, when opening
   * Xcode's Signing tab for the first time rewrote that file and stripped every
   * comment out of it. The values survived; the why did not. Nothing explaining
   * a decision should be written in that file again.
   */
  it("requires arm64 rather than the template's 32-bit armv7", () => {
    expect(plistArray("UIRequiredDeviceCapabilities")).toEqual(["arm64"]);
  });

  /** iPad is a separate surface with no notch to hide a layout behind. */
  it("leaves the iPad free to rotate", () => {
    expect(plistArray("UISupportedInterfaceOrientations~ipad")).toHaveLength(4);
  });
});

describe("the permissions iOS kills the app for not declaring", () => {
  /**
   * Not a warning and not a denied prompt: iOS terminates the process the
   * instant getUserMedia asks for a device whose purpose string is absent. The
   * camera one gates the liveness check, which gates joining at all — so
   * without it the app dies partway through onboarding, on every device, for
   * everybody.
   */
  it("declares the camera the liveness check needs", () => {
    const match = /<key>NSCameraUsageDescription<\/key>\s*<string>(.+?)<\/string>/.exec(plist);
    expect(match?.[1]?.length ?? 0).toBeGreaterThan(10);
  });

  it("declares the microphone a voice message needs", () => {
    const match = /<key>NSMicrophoneUsageDescription<\/key>\s*<string>(.+?)<\/string>/.exec(plist);
    expect(match?.[1]?.length ?? 0).toBeGreaterThan(10);
  });

  /**
   * A permission alert is drawn over whatever is on screen and is exactly the
   * kind of thing read over a shoulder (§9.6). Neither string may name what the
   * app is for. The same list the tone checks use, minus the words that are
   * ordinary English elsewhere.
   */
  it("says nothing about who the app is for", () => {
    const strings = [
      /<key>NSCameraUsageDescription<\/key>\s*<string>(.+?)<\/string>/,
      /<key>NSMicrophoneUsageDescription<\/key>\s*<string>(.+?)<\/string>/,
    ].map((pattern) => pattern.exec(plist)?.[1] ?? "");

    for (const value of strings) {
      expect(value.toLowerCase()).not.toMatch(
        /\b(hsv|hiv|herpes|std|sti|status|positive|dating)\b/,
      );
    }
  });
});

describe("push can actually reach the app", () => {
  const appDelegate = read("ios/App/App/AppDelegate.swift");

  /**
   * iOS hands the APNs device token to the app delegate. The plugin listens for
   * a NotificationCenter post. Nothing connects the two unless these methods
   * exist, and the Capacitor template ships an AppDelegate with neither.
   *
   * Missing, push does not fail loudly — it fails as silence. `register()`
   * succeeds, iOS produces a token, and hands it to a method nobody wrote; the
   * `registration` event never fires and the settings screen says "that did not
   * work" with nothing anywhere to say why. It cost a TestFlight build on a real
   * iPad to find, because the Simulator never gets far enough to produce a token
   * — every check before that one passed.
   */
  it("forwards the APNs token from the app delegate to the plugin", () => {
    expect(appDelegate).toMatch(/didRegisterForRemoteNotificationsWithDeviceToken/);
    expect(appDelegate).toMatch(/capacitorDidRegisterForRemoteNotifications/);
  });

  it("forwards the failure too, so a refusal is not silence either", () => {
    expect(appDelegate).toMatch(/didFailToRegisterForRemoteNotificationsWithError/);
    expect(appDelegate).toMatch(/capacitorDidFailToRegisterForRemoteNotifications/);
  });

  /**
   * The entitlement iOS checks before it will hand over a token at all. It is
   * `production` because that is what TestFlight and the App Store use, and it
   * has to agree with APNS_ENVIRONMENT in Vercel — a token minted against one
   * host is refused by the other with 400 BadDeviceToken.
   */
  it("claims the push entitlement the profile grants", () => {
    const entitlements = read("ios/App/App/App.entitlements");
    expect(entitlements).toMatch(/<key>aps-environment<\/key>\s*<string>production<\/string>/);
    const pbxproj = read("ios/App/App.xcodeproj/project.pbxproj");
    expect(pbxproj).toMatch(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/);
  });
});

describe("the view controller stays a table of contents", () => {
  const mainViewController = read("ios/App/App/MainViewController.swift");
  const pbxproj = read("ios/App/App.xcodeproj/project.pbxproj");

  /**
   * `capacitorDidLoad()` is the only place native code gets a bridge before the
   * page loads, so everything the shell adds has to be called from it. That
   * makes it the natural place for everything to accumulate, and it had already
   * started: plugin registration, a notification observer, an allowlist of
   * hosts and a navigation rule, in one class, with the observer's lifetime
   * mixed in among them.
   *
   * Split so each concern owns its file. What this pins is the shape rather
   * than the contents — the controller names things and holds no logic of its
   * own, so a fourth concern is a line here and a file beside it.
   */
  it("delegates rather than doing the work itself", () => {
    expect(mainViewController).toMatch(/ShellPlugins\.register\(on: bridge\)/);
    expect(mainViewController).toMatch(/UniversalLinkRouter\(controller: self\)/);

    // The two things it used to do inline, and must not do again.
    expect(mainViewController).not.toMatch(/NotificationCenter/);
    expect(mainViewController).not.toMatch(/registerPluginInstance/);
  });

  /**
   * Xcode does not compile a file because it exists on disk — it compiles what
   * is in the build phase. PrivacyInfo.xcprivacy was missing from the bundle
   * for exactly this reason, and a plugin left out of Sources fails the way an
   * unregistered one does: silence, and a promise that never settles.
   */
  it("compiles every file the shell adds", () => {
    for (const file of [
      "MainViewController",
      "ShellPlugins",
      "UniversalLinkRouter",
      "StoreKitPlugin",
      "ShellPlugin",
    ]) {
      expect(pbxproj).toMatch(new RegExp(`${file}\\.swift in Sources`));
    }
  });
});

describe("the shell can sell the premium tier", () => {
  const sceneDelegate = read("ios/App/App/SceneDelegate.swift");
  const shellPlugins = read("ios/App/App/ShellPlugins.swift");
  const plugin = read("ios/App/App/StoreKitPlugin.swift");

  /**
   * Guideline 3.1.1 requires in-app purchase for a subscription unlocked inside
   * the app, and `e8eee7d` correctly hid the Stripe checkout here without
   * replacing it — so until StoreKit works the paid tier is unreachable in the
   * shell. Every assertion below pins a step that failed silently while it was
   * being built: none of them produced an error, a log line, or a rejected
   * promise. They produced a plugin that was not there.
   */
  it("builds the root controller that registers the plugin", () => {
    // The template ships BOTH a Main.storyboard naming a root controller and a
    // SceneDelegate that builds one directly, and the scene delegate wins. An
    // hour went into editing the storyboard, which is never read.
    expect(sceneDelegate).toMatch(/rootViewController = MainViewController\(\)/);
  });

  /**
   * `registerPluginType` — the call every guide shows — begins
   * `if autoRegisterPlugins { return }`, and auto-registration is the default.
   * It returns having done nothing, silently. From the page that looks like a
   * plugin absent from `Capacitor.PluginHeaders` and a `nativePromise` that
   * never settles: not a rejection, no timeout of its own, just silence.
   */
  it("registers by instance, because registering by type is a no-op", () => {
    expect(shellPlugins).toMatch(/registerPluginInstance\(PlusOneStoreKitPlugin\(\)\)/);
    // The call, not the word — the comment above it names the trap on purpose.
    expect(shellPlugins).not.toMatch(/registerPluginType\(/);
  });

  /** A source file that is not in the build phase is not in the app — the same
      way PrivacyInfo.xcprivacy was not, for the same reason. */
  it("compiles both files into the app", () => {
    const pbxproj = read("ios/App/App.xcodeproj/project.pbxproj");
    expect(pbxproj).toMatch(/StoreKitPlugin\.swift in Sources/);
    expect(pbxproj).toMatch(/MainViewController\.swift in Sources/);
  });

  /** The one string the two halves have to agree on, in two languages, in two
      apps that deploy on different clocks. */
  it("agrees with the web side on the plugin name", () => {
    expect(plugin).toMatch(/let jsName = "PlusOneStoreKit"/);
    const web = readFileSync(join(HERE, "..", "web", "src", "lib", "native-iap.ts"), "utf8");
    expect(web).toMatch(/const PLUGIN = "PlusOneStoreKit"/);
  });

  /**
   * A transaction is finished only after the server has granted. Finishing on
   * receipt throws away StoreKit's redelivery, which is the only thing standing
   * between "the grant request failed" and "they paid and got nothing".
   */
  it("does not finish a transaction at the point of purchase", () => {
    const purchase = plugin.slice(
      plugin.indexOf("func purchase"),
      plugin.indexOf("// MARK: - Recovery"),
    );
    expect(purchase).not.toMatch(/\.finish\(\)/);
  });
});

describe("the page decides whether the shell is light or dark", () => {
  const shellPlugin = read("ios/App/App/ShellPlugin.swift");
  const shellPlugins = read("ios/App/App/ShellPlugins.swift");

  /**
   * iOS reads the SYSTEM appearance; this app reads the member's stored choice.
   * When they disagree UIKit does not just pick the wrong status bar text — it
   * lays a grey scrim over the top 62pt of the page to reconcile them.
   * `SystemBars.setStyle` fixes the text and leaves the scrim, because the
   * scrim is `overrideUserInterfaceStyle`, which no Capacitor API exposes.
   */
  it("can set the interface style the band actually follows", () => {
    expect(shellPlugin).toMatch(/overrideUserInterfaceStyle/);
    expect(shellPlugin).toMatch(/let jsName = "PlusOneShell"/);
  });

  /**
   * On the window, not the view controller. The scrim is drawn outside the web
   * view's own bounds, so a controller-level override leaves it in place.
   */
  it("overrides on the window, which is the layer the scrim is above", () => {
    expect(shellPlugin).toMatch(/window\.overrideUserInterfaceStyle = style/);
  });

  /**
   * The app icon's number, which only native can set.
   *
   * Zero clears rather than a separate call, because that is Apple's API and
   * inventing a `clearBadge` beside it would be a second way to do one thing.
   * The iOS 15 branch is not dead: the deployment target is 15.0 and
   * `setBadgeCount` is 16+.
   */
  it("can set the app icon badge, which WKWebView cannot", () => {
    expect(shellPlugin).toMatch(/name: "setBadge"/);
    expect(shellPlugin).toMatch(/setBadgeCount\(count\)/);
    expect(shellPlugin).toMatch(/applicationIconBadgeNumber = count/);
    // Never negative — iOS refuses it and there is no sensible reading.
    expect(shellPlugin).toMatch(/max\(0, call\.getInt\("count"\) \?\? 0\)/);
  });

  /** Registered by instance, for the reason the StoreKit plugin records. */
  it("is registered, and compiled into the app", () => {
    expect(shellPlugins).toMatch(/registerPluginInstance\(PlusOneShellPlugin\(\)\)/);
    expect(read("ios/App/App.xcodeproj/project.pbxproj")).toMatch(/ShellPlugin\.swift in Sources/);
  });

  /** The name, agreed across two languages and two release clocks. */
  it("agrees with the web side on the plugin name", () => {
    const web = readFileSync(join(HERE, "..", "web", "src", "app", "status-bar-style.tsx"), "utf8");
    expect(web).toMatch(/"PlusOneShell"/);
  });
});

describe("a tapped link opens the app and not Safari", () => {
  const entitlements = read("ios/App/App/App.entitlements");
  const router = read("ios/App/App/UniversalLinkRouter.swift");

  /**
   * Without the entitlement a notification tap or an emailed link opens Safari,
   * which has its own cookie jar — so a signed-in member lands on a sign-in
   * page and the app they already have is not involved.
   */
  it("claims the domain the site is actually served from", () => {
    expect(entitlements).toMatch(/<key>com\.apple\.developer\.associated-domains<\/key>/);
    expect(entitlements).toMatch(/applinks:www\.loveplusone\.app/);
  });

  /**
   * The apex is left out ON PURPOSE, and it looks like an omission.
   *
   * iOS does not follow redirects when it fetches an association file, and the
   * apex answers 308 to www — measured, not assumed. Claiming it would mean iOS
   * fetching a redirect, failing, and never claiming the domain, with nothing
   * logged anywhere. It is the same trap that keeps the Android TWA pointed at
   * www, and the same one that ejected the iOS shell into Safari.
   *
   * `MainViewController` accepts the apex if a link ever arrives from one,
   * which costs nothing. Claiming it in the entitlement is what does not work.
   */
  it("does not claim the apex, which answers a redirect", () => {
    expect(entitlements).not.toMatch(/applinks:loveplusone\.app/);
  });

  /**
   * Capacitor posts a notification for a universal link and NOTHING in core
   * listens — `@capacitor/app` is what normally does. Without a listener the
   * app opens on whatever page it last had and the tapped link is simply lost,
   * which is worse than the Safari behaviour this replaces: the member gets the
   * app and not the thing they tapped, with nothing to say why.
   */
  it("listens for the link and takes the web view to it", () => {
    expect(router).toMatch(/capacitorSceneOpenUniversalLink/);
    expect(router).toMatch(/webView\?\.load\(URLRequest\(url: url\)\)/);
  });

  /** The window the member's session lives in does not follow a link anywhere
      else, whatever hands it over. */
  it("refuses a link to any other host", () => {
    expect(router).toMatch(/claimedHosts\.contains\(host\)/);
  });

  /**
   * The app id in the association file is `TEAMID.bundleid`, and the two halves
   * live in files nothing keeps in step. Wrong, iOS declines the domain in
   * silence — there is no error and no log, links simply keep opening a
   * browser.
   */
  it("agrees with the Xcode project about which app it is", () => {
    const aasa = readFileSync(
      join(
        HERE,
        "..",
        "web",
        "src",
        "app",
        ".well-known",
        "apple-app-site-association",
        "route.ts",
      ),
      "utf8",
    );
    const bundle = /const BUNDLE_ID = "([^"]+)"/.exec(aasa)?.[1];
    expect(bundle).toBe("app.loveplusone");
    expect(pbxproj).toMatch(
      new RegExp(`PRODUCT_BUNDLE_IDENTIFIER = ${bundle?.replace(/\./g, "\\.")};`),
    );

    // The same team id the APNs key is issued under; a mismatch here fails the
    // same silent way.
    expect(/const TEAM_ID = "([^"]+)"/.exec(aasa)?.[1]).toBe("JUR426AHDD");
  });
});

describe("the identity the App Store record gets", () => {
  /**
   * A bundle id cannot be changed once a listing exists — only abandoned, along
   * with the reviews and the subscribers. It is written in two files that no
   * tool keeps in step, and `cap sync` does not reconcile them.
   */
  it("is the same in the config and in the Xcode project", () => {
    expect(config).toMatch(/appId:\s*"app\.loveplusone"/);
    expect(pbxproj).toMatch(/PRODUCT_BUNDLE_IDENTIFIER = app\.loveplusone;/);
    expect(pbxproj).not.toMatch(/PRODUCT_BUNDLE_IDENTIFIER = com\.getcapacitor/);
  });

  /**
   * One name on one phone. The installed web app uses BRAND.deviceNameFallback
   * and so does this — two names for one product is how somebody ends up with
   * both installed and no idea which is which.
   */
  it("carries the same home-screen name as the installed web app", () => {
    expect(config).toMatch(/appName:\s*"PlusOne"/);
    expect(plist).toMatch(/<key>CFBundleDisplayName<\/key>\s*<string>PlusOne<\/string>/);
  });

  /**
   * App Store Connect rejects a 1024 icon that carries an alpha channel, and it
   * checks for the CHANNEL rather than for any transparent pixel — an icon that
   * looks perfectly opaque is rejected just the same. The rejection arrives at
   * upload, which is the worst moment to discover it.
   *
   * Read from the PNG header rather than with an image library: byte 25 is
   * IHDR's colour type, and 4 and 6 are the two that carry alpha.
   */
  it("has an app icon App Store Connect will accept", () => {
    const icon = readFileSync(
      join(HERE, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"),
    );

    expect(icon.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(icon.readUInt32BE(16)).toBe(1024);
    expect(icon.readUInt32BE(20)).toBe(1024);
    expect([4, 6]).not.toContain(icon.readUInt8(25));
  });
});

describe("both shells begin in the same place", () => {
  /**
   * A signed-in member who closed the app and reopened it landed on the
   * marketing page on iPad and on Tonight on Android. The shells disagreed
   * about where the app starts: `twa-manifest.json` has always set `startUrl`
   * to `/app`, and the iOS default was a bare origin, so WKWebView loaded `/`
   * every launch.
   *
   * AGENTS.md's rule is that a thing verified in one engine is not verified in
   * the other. This is the cheap half of that — a difference the two config
   * files can be asked about directly, without either shell running.
   */
  const twa = JSON.parse(
    readFileSync(fileURLToPath(new URL("../android/twa-manifest.json", import.meta.url)), "utf8"),
  ) as { startUrl: string };

  it("the TWA still starts at /app", () => {
    expect(twa.startUrl).toBe("/app");
  });

  it("the iOS shell's default lands on the same path", () => {
    // Read out of the source rather than imported: the config module reads
    // process.env at import time, and a test that set CAP_SERVER_URL would be
    // asserting about itself.
    expect(config).toMatch(/CAP_SERVER_URL"\] \?\? "https:\/\/www\.loveplusone\.app\/app"/);
  });

  it("and the host is allow-listed, which is what makes a path safe here", () => {
    // Capacitor's fallback rule prefix-matches the WHOLE server.url string, so
    // giving it a path would eject every other page to Safari — except that
    // `www` is named explicitly, which is why the path can be set at all.
    expect(config).toMatch(/allowNavigation: \["loveplusone\.app", "www\.loveplusone\.app"\]/);
  });
});
