import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The status-bar mapping, pinned.
 *
 * A source-reading test, in the style CONTRIBUTING describes, because the thing
 * that can go wrong here has no runtime surface in any test environment: it
 * only exists inside a WKWebView, on a phone whose system appearance disagrees
 * with the member's chosen theme.
 */
const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "status-bar-style.tsx"),
  "utf8",
);

describe("the native status bar follows the page theme", () => {
  /**
   * THE NAMES DESCRIBE THE BACKGROUND, NOT THE TEXT. Capacitor's `DARK` is
   * documented as "light text for dark backgrounds", so Dusk — a dark page —
   * takes `DARK`, and Linen takes `LIGHT`.
   *
   * Read as text colours they are exactly inverted, and inverting them does not
   * fail loudly: it produces white-on-cream and black-on-near-black, which is
   * the original bug with worse contrast. Nothing else in this repository would
   * catch that, which is why it is written down here.
   */
  it("maps Dusk to DARK and Linen to LIGHT, not the other way round", () => {
    expect(source).toMatch(/dark\s*\?\s*"DARK"\s*:\s*"LIGHT"/);
    expect(source).toMatch(/data-theme"\)\s*===\s*"dark"/);
  });

  /**
   * `SystemBars` ships inside @capacitor/ios rather than as a plugin.
   * `@capacitor/status-bar` was added first and removed again: it drives the
   * same `bridge.statusBarStyle` through the same code path, so it was a
   * dependency bought for nothing.
   */
  it("uses the bridge's built-in SystemBars rather than a plugin", () => {
    expect(source).toMatch(/nativePromise\(\s*"SystemBars"\s*,\s*"setStyle"/);
    expect(source).not.toMatch(/@capacitor\/status-bar["']/);
  });

  /**
   * The shell loads this app over the network, so `apps/web` and `apps/ios`
   * ship on entirely different clocks: a web deploy reaches shells built before
   * any of this existed and which will never have it. Both guards matter — the
   * absent-bridge check for every browser, and the caught rejection for an old
   * shell. A page that throws is a worse outcome than a wrong status bar.
   */
  it("degrades rather than throwing where the bridge is old or absent", () => {
    expect(source).toMatch(/if\s*\(!bridge\?\.nativePromise\)\s*return/);
    expect(source).toMatch(/\.catch\(\(\)\s*=>/);
    expect(source).toMatch(/if\s*\(!inNativeShell\(\)\)\s*return/);
  });

  /**
   * The half that removes the BAND rather than the wrong text colour.
   *
   * SystemBars was shipped first and looked like the whole fix: it resolves,
   * and the clock visibly changes colour. The grey scrim over the top 62pt
   * stayed exactly where it was, because it is not the status bar — it is
   * UIKit reconciling a light page with a dark system through the view
   * controller's `overrideUserInterfaceStyle`. Measured on a dark phone with
   * Linen chosen: rgb(139,134,128) at the top of the page against Linen's own
   * rgb(239,233,223), and 239,233,223 at every row afterwards.
   *
   * There is no Capacitor API for it, which is why `PlusOneShell` exists in
   * apps/ios at all.
   */
  it("also sets the interface style, which is what the band follows", () => {
    expect(source).toMatch(/nativePromise\(\s*"PlusOneShell"\s*,\s*"setInterfaceStyle"/);
  });

  /**
   * Two calls, two catches, deliberately not chained or awaited together.
   *
   * They land in shells of different ages: one built before PlusOneShell
   * existed still has SystemBars, and must still get its status bar right.
   * Chaining them would let the missing one take the working one down, and the
   * failure would be a status bar that quietly stopped following the theme.
   */
  it("does not let one missing plugin take the other down", () => {
    const calls = source.match(/nativePromise\([^)]*\)[\s\S]{0,120}?\.catch\(/g) ?? [];
    expect(calls.length).toBe(2);
    expect(source).not.toMatch(/Promise\.all/);
  });

  /**
   * The attribute is where every route to a theme change ends up — the inline
   * script on first paint, and whatever toggle eventually ships. Watching the
   * storage key instead would miss anything that sets the attribute directly.
   */
  it("watches the attribute rather than the storage key", () => {
    expect(source).toMatch(/MutationObserver/);
    expect(source).toMatch(/attributeFilter:\s*\["data-theme"\]/);
  });
});
