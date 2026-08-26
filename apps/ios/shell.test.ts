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
    expect(config).toMatch(/CAP_SERVER_URL"\]\s*\?\?\s*"https:\/\/www\.loveplusone\.app"/);
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
