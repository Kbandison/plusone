import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AASA_HEADERS, applinks } from "@/app/.well-known/apple-app-site-association/route";

/**
 * Universal Links fail silently, exactly like assetlinks.json.
 *
 * A wrong app id, a wrong content-type, a redirect, or the file at a path with
 * `.json` on the end all produce the same outcome: iOS never claims the domain,
 * nothing errors, and every link keeps opening Safari. There is no log to read
 * and no dialog to dismiss — which is why the shape is asserted here rather
 * than trusted to a reading.
 */
const WELL_KNOWN = join(import.meta.dirname, "../app/.well-known");

interface Applinks {
  applinks: {
    details: { appIDs: string[]; components: { "/": string; comment?: string }[] }[];
  };
}

/**
 * Read from the exported payload, not by calling the route.
 *
 * GET carries `use cache` now, and `cacheLife()` throws unless the
 * `cacheComponents` config is active — which a vitest run is not. So the shape
 * assertions read `applinks()` directly, which is what they were ever about.
 */
const body = (): Applinks => applinks() as Applinks;

describe("apple-app-site-association", () => {
  it("is served from a path with no extension", () => {
    // `apple-app-site-association.json` is a different URL and iOS does not
    // look for it. The directory name IS the path.
    const entries = readdirSync(WELL_KNOWN);
    expect(entries).toContain("apple-app-site-association");
    expect(entries).not.toContain("apple-app-site-association.json");
  });

  it("declares application/json, which iOS will not guess at", async () => {
    expect(AASA_HEADERS["content-type"]).toMatch(/application\/json/);
  });

  it("is cached for ever, so iOS revalidating does not wake a server", () => {
    // Was `dynamic = "force-static"`, which cacheComponents refuses outright.
    // The property is the same and the mechanism is not, so this reads the
    // source rather than an export that no longer exists.
    const route = readFileSync(
      join(import.meta.dirname, "../app/.well-known/apple-app-site-association/route.ts"),
      "utf8",
    );
    // It stays prerenderable by touching nothing request-time, not by a
    // declaration — cacheComponents refuses `dynamic` and `use cache` cannot
    // wrap a handler returning a Response. So this asserts the property that
    // actually keeps it static.
    for (const api of ["cookies(", "headers(", "Date.now(", "new Date(", "Math.random("]) {
      expect(route, `the route reads ${api}`).not.toContain(api);
    }
  });

  it("names the app as team id then bundle id", async () => {
    const [detail] = body().applinks.details;
    expect(detail?.appIDs).toEqual(["JUR426AHDD.app.loveplusone"]);
    // Android uses the same identifier deliberately — one name across both
    // stores, so a bundle id in a crash report needs no disambiguation.
    expect(detail?.appIDs[0]).toMatch(/\.app\.loveplusone$/);
  });

  it("uses appIDs and components, not the iOS 12 pair", async () => {
    const [detail] = body().applinks.details;
    // `appID` and `paths` still parse, and the system prefers `components`
    // where both exist — so the older pair beside them is dead weight that
    // reads as though it were authoritative.
    expect(detail).toHaveProperty("appIDs");
    expect(detail).toHaveProperty("components");
    expect(detail).not.toHaveProperty("appID");
    expect(detail).not.toHaveProperty("paths");
  });

  it("claims the member area, invites, and the sign-in return", async () => {
    const patterns = body().applinks.details[0]!.components.map((c) => c["/"]);
    expect(patterns).toContain("/app/*");
    expect(patterns).toContain("/i/*");
    // The one that is not obvious. A session that lands in Safari is a session
    // the shell cannot see, which reads to a member as being signed out.
    expect(patterns).toContain("/auth/*");
  });

  it("leaves the marketing pages to the browser", async () => {
    const patterns = body().applinks.details[0]!.components.map((c) => c["/"]);
    // A shared /faq link is usually shared with somebody who does NOT have the
    // app, and a universal link into an app they do not have does nothing —
    // while the same page in a browser is the entire point of it being public.
    for (const page of ["/faq", "/how-it-works", "/guidelines", "/pricing", "/terms", "/privacy"]) {
      expect(patterns).not.toContain(`${page}/*`);
      expect(patterns).not.toContain(page);
    }
    // And nothing claims everything, which would take all of them silently.
    expect(patterns).not.toContain("*");
    expect(patterns).not.toContain("/*");
  });
});
