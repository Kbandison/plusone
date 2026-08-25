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
  void bridge
    .nativePromise("SystemBars", "setStyle", { style: dark ? "DARK" : "LIGHT" })
    .catch(() => {
      // A shell older than SystemBars. Nothing to do about it here, and
      // nothing worth telling the member.
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
