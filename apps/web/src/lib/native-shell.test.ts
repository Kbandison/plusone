import { afterEach, describe, expect, it, vi } from "vitest";

import { inNativeShell, inTwa, nativePlatform } from "./native-shell";

/** Stands in for whatever Capacitor has injected, or for nothing at all. */
function windowWith(capacitor: unknown) {
  vi.stubGlobal("window", capacitor === undefined ? {} : { Capacitor: capacitor });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("inNativeShell", () => {
  it("is false in a browser, where nothing injects Capacitor", () => {
    windowWith(undefined);
    expect(inNativeShell()).toBe(false);
    expect(nativePlatform()).toBe(null);
  });

  it("is false on Capacitor's own web target", () => {
    // The runtime is present and reports itself not native. A browser with the
    // bundle loaded must behave exactly like one without it, or wrapping the
    // app would change what every browser sees.
    windowWith({ isNativePlatform: () => false, getPlatform: () => "web" });
    expect(inNativeShell()).toBe(false);
    expect(nativePlatform()).toBe(null);
  });

  it("is true in the iOS shell, which is the case the branch got wrong", () => {
    windowWith({ isNativePlatform: () => true, getPlatform: () => "ios" });
    expect(inNativeShell()).toBe(true);
    expect(nativePlatform()).toBe("ios");
  });

  it("is true in the Android shell", () => {
    windowWith({ isNativePlatform: () => true, getPlatform: () => "android" });
    expect(inNativeShell()).toBe(true);
    expect(nativePlatform()).toBe("android");
  });

  it("still reports a shell whose platform name it does not recognise", () => {
    // The guard and the label answer separately on purpose. Treating an
    // unknown native platform as a browser would hand somebody inside the app
    // the instructions for installing it.
    windowWith({ isNativePlatform: () => true, getPlatform: () => "electron" });
    expect(inNativeShell()).toBe(true);
    expect(nativePlatform()).toBe(null);
  });

  it("survives a runtime that injected the object and nothing else", () => {
    windowWith({});
    expect(inNativeShell()).toBe(false);
    expect(nativePlatform()).toBe(null);
  });

  it("is false when there is no window at all", () => {
    // Server render. Both of these run inside components that also render on
    // the server before hydration.
    vi.stubGlobal("window", undefined);
    expect(inNativeShell()).toBe(false);
    expect(nativePlatform()).toBe(null);
  });
});

describe("inTwa", () => {
  /** Storage that behaves, and storage that refuses — both are real. */
  function browser(referrer: string, storage: "works" | "blocked" = "works") {
    const store = new Map<string, string>();
    const sessionStorage =
      storage === "works"
        ? {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, v),
          }
        : {
            getItem: () => {
              throw new Error("blocked");
            },
            setItem: () => {
              throw new Error("blocked");
            },
          };
    vi.stubGlobal("window", { sessionStorage });
    vi.stubGlobal("document", { referrer });
    return store;
  }

  it("is false in an ordinary tab", () => {
    browser("https://loveplusone.app/app");
    expect(inTwa()).toBe(false);
  });

  it("is false with no referrer at all", () => {
    browser("");
    expect(inTwa()).toBe(false);
  });

  it("is true when Chrome launched it from the Play app", () => {
    browser("android-app://app.loveplusone.twa");
    expect(inTwa()).toBe(true);
  });

  it("still answers true after the referrer is gone", () => {
    // The referrer belongs to the launch navigation. A reload drops it, and
    // without the cache the same tab would answer yes and then no.
    const store = browser("android-app://app.loveplusone.twa");
    expect(inTwa()).toBe(true);
    expect(store.get("plusone:twa")).toBe("1");

    vi.stubGlobal("document", { referrer: "" });
    expect(inTwa()).toBe(true);
  });

  it("answers from the referrer when storage is blocked", () => {
    // Caching is an optimisation. Losing it must not lose the answer.
    browser("android-app://app.loveplusone.twa", "blocked");
    expect(inTwa()).toBe(true);
  });

  it("does not confuse a TWA with a Capacitor shell", () => {
    browser("android-app://app.loveplusone.twa");
    expect(inTwa()).toBe(true);
    // No window.Capacitor, so the native helpers must still say no — a TWA
    // takes web push and stays platform 'web'.
    expect(inNativeShell()).toBe(false);
    expect(nativePlatform()).toBe(null);
  });

  it("is false when there is no document", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", undefined);
    expect(inTwa()).toBe(false);
  });
});
