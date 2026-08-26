import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A Trusted Web Activity fails silently, and only ever in one direction.
 *
 * Chrome removes its address bar once it has fetched
 * `/.well-known/assetlinks.json` from the app's host and found the app's own
 * signing certificate named there. If the package name disagrees, or the
 * fingerprint disagrees, or the host redirects, nothing errors — the app
 * installs, launches, works, and keeps a browser address bar across the top
 * forever. There is no log and no dialog.
 *
 * So the two halves are asserted against each other here. `twa-manifest.json`
 * is what the Android app claims to be; the route handler is what the website
 * says about it. They are edited in different places, months apart, by whoever
 * is holding whichever end — which is exactly how they drift.
 */
const manifest = JSON.parse(
  readFileSync(join(import.meta.dirname, "twa-manifest.json"), "utf8"),
) as {
  packageId: string;
  host: string;
  startUrl: string;
  enableNotifications: boolean;
  fingerprints: { name: string; value: string }[];
  signingKey: { path: string; alias: string };
};

const assetlinks = readFileSync(
  join(import.meta.dirname, "../web/src/app/.well-known/assetlinks.json/route.ts"),
  "utf8",
);

describe("the TWA agrees with what the site says about it", () => {
  it("uses the package name the site delegates to", () => {
    expect(assetlinks).toContain(`"${manifest.packageId}"`);
  });

  it("carries the same signing fingerprint the site names", () => {
    const play = manifest.fingerprints.find((f) => f.name === "play-app-signing");
    expect(play).toBeDefined();
    // Play's APP SIGNING key, not the upload key. Google re-signs every upload,
    // so the app-signing certificate is the one a phone actually sees — naming
    // the upload key here is the single most common way this fails.
    expect(assetlinks).toContain(play!.value);
  });
});

describe("the origin", () => {
  it("is www, never the apex", () => {
    // Chrome does NOT follow redirects fetching assetlinks.json, and the apex
    // answers 308. A TWA pointed there fails verification and keeps its address
    // bar, with nothing logged. Same trap that ejected the iOS shell into
    // Safari — one cause, two shells, both silent.
    expect(manifest.host).toBe("www.loveplusone.app");
    expect(manifest.host).not.toBe("loveplusone.app");
  });

  it("opens the member area rather than the marketing site", () => {
    expect(manifest.startUrl).toBe("/app");
  });
});

describe("notifications", () => {
  it("delegates them, or web push is silent in the installed app", () => {
    // A TWA is real Chrome, so the service worker and the push subscription
    // already work — but Android will not show a notification from it unless
    // the app declares the delegation. Off, everything registers correctly and
    // nothing ever appears, which reads as a push bug rather than a manifest
    // one.
    expect(manifest.enableNotifications).toBe(true);
  });
});

describe("signing", () => {
  it("has no key committed, and says so by being empty", () => {
    // The upload key is Kevin's and is not in this repo — .gitignore refuses
    // *.keystore for the same reason. An empty path here is the held value,
    // not an oversight, and `bubblewrap build` is what needs it.
    expect(manifest.signingKey.path).toBe("");
    expect(manifest.signingKey.alias).toBe("");
  });
});
