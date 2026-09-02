import { existsSync, readFileSync } from "node:fs";
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
  features: { playBilling?: { enabled?: boolean } };
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

describe("Play Billing", () => {
  it("is enabled, or Play will not let a subscription be created at all", () => {
    // This is not only about selling. Play Console refuses to show the
    // monetization screens until a build has been uploaded that DECLARES
    // billing, so an app generated without this cannot have products defined
    // against it — the console asks for a new upload and does not say why.
    expect(manifest.features.playBilling?.enabled).toBe(true);
  });

  it("is what the billing decision requires on Android", () => {
    // Store billing on both platforms, decided 2026-08-24. Play Billing is
    // required for a subscription and the policy names dating in its own
    // examples, so a TWA that reaches Stripe checkout is the prohibited case —
    // and the Digital Goods API is how a TWA sells through Play instead.
    expect(manifest.features.playBilling).toBeDefined();
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

describe("the delegation service strips the origin", () => {
  /**
   * Chrome builds every web notification with the origin in `subText`, and it
   * survives delegation — so a lock screen read "⁺One · www.loveplusone.app".
   * The wordmark is deliberately non-obvious and the domain is not, which is
   * the wrong half to print on an app whose premise is that disclosure belongs
   * to the member.
   *
   * Bubblewrap REGENERATES DelegationService.java on `bubblewrap update`, which
   * would silently drop this. That is what this test is for.
   */
  const service = readFileSync(
    join(import.meta.dirname, "app/src/main/java/app/loveplusone/DelegationService.java"),
    "utf8",
  );

  it("overrides the notification hook", () => {
    expect(service).toMatch(/onNotifyNotificationWithChannel/);
    expect(service).toMatch(/setSubText\(null\)/);
  });

  it("still registers the billing handler it was generated for", () => {
    // The override is an addition, not a replacement. Losing this breaks Play
    // Billing in a way that looks like the catalogue problem all over again.
    expect(service).toMatch(/DigitalGoodsRequestHandler/);
  });

  it("falls back to Chrome's notification rather than losing it", () => {
    // recoverBuilder can throw on a Notification it cannot reconstruct, and a
    // throw inside the delegation path is silence — the exact failure mode this
    // area has already produced twice.
    expect(service).toMatch(/catch \(Throwable/);
    expect(service).toMatch(/toPost = notification/);
  });

  it("guards the API level, since minSdk is below it", () => {
    // recoverBuilder is API 24+; twa-manifest declares minSdkVersion 23.
    expect(service).toMatch(/Build\.VERSION_CODES\.N/);
  });
});

describe("the notification icon survives into the build", () => {
  /**
   * v3 shipped without `ic_notification_icon` at all — the drawable was absent
   * from the APK entirely, so SMALL_ICON pointed at a resource id with no entry
   * and Android substituted its own default. It read as a stale icon that no
   * amount of regenerating would fix, because the file on disk was never the
   * problem.
   *
   * Found 2026-09-01 by dumping the resource table of the APK pulled OFF THE
   * PHONE, which is the only artifact that could have answered it: the repo's
   * copy had the drawable, the source tree had it at five densities, and both
   * were irrelevant.
   *
   * This checks the source is complete. Whether it reaches the APK is a
   * question only a built APK can answer, and the density list in
   * BACKLOG server 26 records how to ask it.
   */
  const densities = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];

  it("exists at every density the launcher icons use", () => {
    for (const d of densities) {
      const file = join(
        import.meta.dirname,
        `app/src/main/res/drawable-${d}/ic_notification_icon.png`,
      );
      expect(existsSync(file), `ic_notification_icon missing at ${d}`).toBe(true);
    }
  });

  it("is alpha, since Android draws the silhouette and discards colour", () => {
    // An opaque small icon renders as a solid white block.
    for (const d of densities) {
      const b = readFileSync(
        join(import.meta.dirname, `app/src/main/res/drawable-${d}/ic_notification_icon.png`),
      );
      const colourType = b.readUInt8(25);
      expect([4, 6], `${d} has colour type ${colourType}, which carries no alpha`).toContain(
        colourType,
      );
    }
  });

  it("is the same mark the web badge uses", () => {
    // One mark, one generator. They were byte-identical when this was written.
    const badge = readFileSync(join(import.meta.dirname, "../web/public/icons/badge-96.png"));
    const xxxhdpi = readFileSync(
      join(import.meta.dirname, "app/src/main/res/drawable-xxxhdpi/ic_notification_icon.png"),
    );
    expect(xxxhdpi.equals(badge)).toBe(true);
  });
});
