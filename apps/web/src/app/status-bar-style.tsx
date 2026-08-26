"use client";

import { useEffect } from "react";

import { inNativeShell } from "@/lib/native-shell";

/**
 * Tells the native status bar which theme the page is actually wearing.
 *
 * iOS decides the status bar style from the SYSTEM appearance. This app decides
 * its palette from the member's stored choice, which the theme script in the
 * root layout prefers over `prefers-color-scheme`. Nothing keeps those in step,
 * and when they disagree iOS does not merely get it wrong — it dims the app's
 * own content to compensate. Measured on 2026-08-25 in the Simulator: a dark
 * phone with Linen chosen puts a grey scrim over the top 62pt of a cream page,
 * fading from rgb(140,137,130) to Linen exactly at the safe-area inset.
 *
 * Latent rather than live, today: `plusone.theme` is READ by the theme script
 * and written by nothing, so the two can only diverge if the key is set by
 * hand, which is how it was demonstrated. The mechanism is designed-for —
 * tokens.css documents `[data-theme]` as "explicit choice wins in both
 * directions" — so this exists to be already correct when the toggle ships,
 * rather than to be added after somebody reports a grey band.
 *
 * NOTE THE NAMES ARE ABOUT THE BACKGROUND, NOT THE TEXT. Capacitor's `DARK` is
 * "light text for dark backgrounds", so Dusk takes `DARK` and Linen takes
 * `LIGHT`. Reading them as text colours inverts the bug rather than fixing it.
 *
 * `SystemBars` is Capacitor's own, built into core — there is no plugin to
 * install. `@capacitor/status-bar` was tried first and does exactly the same
 * thing through the same `bridge.statusBarStyle`, so it was a dependency for
 * nothing.
 *
 * SystemBars alone was not enough, and the way it failed is worth knowing. It
 * fixes the status bar TEXT, resolves cleanly, and the clock visibly changes —
 * while the grey band stays exactly where it was. The band is not the status
 * bar. It is UIKit reconciling a light page with a dark system through the view
 * controller's `overrideUserInterfaceStyle`, which follows the system until
 * something sets it and which no Capacitor API exposes. `PlusOneShell` is a
 * local plugin in `apps/ios` that exists solely to set it.
 *
 * Measured in the Simulator, dark phone with Linen chosen, sampling the page's
 * own ground at the top of the screen: rgb(139,134,128) before, against Linen's
 * true rgb(239,233,223) — a drift of 100 across the top 62pt. After: 239,233,223
 * at every row, drift of about 1.
 *
 * Called through `Capacitor.nativePromise` rather than by importing anything.
 * The shell loads this app from the network, so nothing here is bundled into
 * it — the bridge injects `nativePromise` at document start and that is the
 * whole interface. It also means `apps/web` and `apps/ios` ship on completely
 * different clocks: a web deploy reaches shells that were built before this
 * plugin existed and will never have it. Hence the guard and the swallowed
 * rejection — an older shell must degrade to the wrong status bar, not to a
 * broken page.
 */
interface CapacitorBridge {
  nativePromise?: (plugin: string, method: string, options: unknown) => Promise<unknown>;
}

function setStyleFromTheme() {
  const bridge = (window as Window & { Capacitor?: CapacitorBridge }).Capacitor;
  if (!bridge?.nativePromise) return;

  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  const style = dark ? "DARK" : "LIGHT";

  void bridge.nativePromise("SystemBars", "setStyle", { style }).catch(() => {
    // A shell older than SystemBars. Nothing to do about it here, and
    // nothing worth telling the member.
  });

  // The second half, and the one that removes the band rather than the wrong
  // text colour. See the note above: SystemBars resolves and demonstrably
  // changes the clock while the grey scrim stays, because the scrim is not the
  // status bar. Same mapping, because it answers the same question — what is
  // this app wearing — and UIKit's `.dark` means a dark ground exactly as
  // Capacitor's `DARK` does.
  void bridge.nativePromise("PlusOneShell", "setInterfaceStyle", { style }).catch(() => {
    // A shell built before PlusOneShell existed. It keeps the band; the page
    // is unharmed, and this is the ONLY consequence — which is why the two
    // calls are separate rather than chained.
  });
}

export function StatusBarStyle() {
  useEffect(() => {
    if (!inNativeShell()) return;

    setStyleFromTheme();

    // The attribute is what every path to a theme change ends at — the inline
    // script on first paint, and whatever eventually toggles it. Observing it
    // rather than the storage key means this cannot be bypassed by a change
    // that sets the attribute some other way.
    const observer = new MutationObserver(setStyleFromTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return null;
}
