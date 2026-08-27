import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The Digital Asset Links file, pinned.
 *
 * Every way of getting this wrong produces the same symptom — a TWA that
 * installs, launches, works, and keeps a browser address bar across the top
 * forever. Chrome logs nothing a developer sees. No other test in this
 * repository would notice, and neither would a person, until somebody installed
 * the shipped app from Play and looked at it.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const route = readFileSync(join(HERE, "../app/.well-known/assetlinks.json/route.ts"), "utf8");

const fingerprints = [...route.matchAll(/"((?:[0-9A-F]{2}:){31}[0-9A-F]{2})"/g)].map((m) => m[1]!);

describe("assetlinks.json", () => {
  /**
   * 32 pairs, uppercase hex, colon separated — the exact shape Play prints and
   * Chrome compares byte for byte. Lowercase is accepted by Chrome but not by
   * every tool that reads this, and a truncated paste is the failure that looks
   * most like a working value.
   */
  it("carries a well-formed SHA-256 for every key", () => {
    expect(fingerprints.length).toBeGreaterThan(0);
    for (const f of fingerprints) expect(f).toMatch(/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });

  /**
   * THREE, because this app is enrolled in quantum-ready hybrid signing.
   *
   * Google's own wording: it "generates a new classical key for the hybrid
   * signature that is different to the classical key it uses for pre-Android 17
   * devices, resulting in your app using three distinct keys", and "you must
   * copy the fingerprints for three keys and register each of them".
   *
   * This file carried only the post-quantum one for two days, and the symptom
   * was a real phone showing a browser address bar — it verifies with the
   * classical key for its Android version, found no match, and fell back
   * silently. One fingerprint here is not a smaller version of correct; it is
   * broken for every device outside one band.
   */
  it("carries all three keys, not just one", () => {
    expect(fingerprints).toHaveLength(3);
    expect(new Set(fingerprints).size).toBe(3);
  });

  /**
   * The Play record was recreated on 2026-08-25 and the signing key went with
   * it. The first fingerprint belongs to an app that no longer exists; if it
   * ever reappears, something restored an old file.
   */
  it("is not the fingerprint from the discarded Play record", () => {
    for (const f of fingerprints) expect(f.startsWith("FB:82:E0")).toBe(false);
  });

  /**
   * And not the UPLOAD key, which is the classic wrong answer.
   *
   * Google re-signs every upload, so the upload key is never what a phone sees.
   * It is on the same App integrity page, one line away, and putting it here
   * fails exactly as silently as everything else on this route.
   */
  it("is not the upload key", () => {
    for (const f of fingerprints) expect(f.startsWith("61:57:3B")).toBe(false);
  });

  /**
   * One identifier across both stores, which is why this is worth asserting
   * rather than trusting: the two live in different packages, no tool keeps them
   * in step, and neither can be changed after publishing.
   */
  it("names the same package Apple knows the app by", () => {
    const capacitor = readFileSync(join(HERE, "../../../ios/capacitor.config.ts"), "utf8");
    const appId = /appId:\s*"([^"]+)"/.exec(capacitor)?.[1];
    expect(appId).toBe("app.loveplusone");
    expect(route).toContain(`PACKAGE_NAME = "${appId}"`);
  });

  /** The only relation a TWA needs, and the one Chrome looks for. */
  it("delegates handling of all urls", () => {
    expect(route).toContain("delegate_permission/common.handle_all_urls");
    expect(route).toContain('namespace: "android_app"');
  });

  /**
   * Chrome's verifier treats anything but application/json as absent, and a
   * Route Handler is dynamic unless told otherwise — which would mean a server
   * render on every revalidation of a file that changes when a signing key
   * changes and never otherwise.
   */
  it("is served static, as json", () => {
    expect(route).toMatch(/dynamic\s*=\s*"force-static"/);
    expect(route).toMatch(/"content-type":\s*"application\/json"/);
  });
});
