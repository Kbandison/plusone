import { afterEach, describe, expect, it, vi } from "vitest";

import { inNativeShell, nativePlatform } from "./native-shell";

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
