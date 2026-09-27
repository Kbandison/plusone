import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ACTIVITY_PING_STORAGE_KEY } from "@plusone/config";

/**
 * A member who opens the TWA or the iOS shell every day may never trigger a
 * full page load, so the layout's recording never runs for them. Review,
 * 2026-09-23. ActivityPing asks when the app becomes visible instead.
 */

vi.mock("./activity-actions", () => ({ pingActivity: async () => {} }));
const { activityPinger } = await import("./activity-ping");

function env(over: Partial<Parameters<typeof activityPinger>[0]> = {}) {
  const store = new Map<string, string>();
  const pings: number[] = [];
  const e = {
    visible: () => true,
    storage: () => ({
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    }),
    today: () => "2026-09-27",
    ping: async () => void pings.push(1),
    ...over,
  };
  return { e, store, pings };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("asking at most once a day", () => {
  it("asks, and remembers the day once the server has answered", async () => {
    const { e, store, pings } = env();
    activityPinger(e)();
    await settle();
    expect(pings).toHaveLength(1);
    expect(store.get(ACTIVITY_PING_STORAGE_KEY)).toBe("2026-09-27");
  });

  it("does not ask again the same day", async () => {
    const { e, pings } = env();
    const run = activityPinger(e);
    run();
    await settle();
    run();
    await settle();
    expect(pings).toHaveLength(1);
  });

  it("asks again the next day", async () => {
    let day = "2026-09-27";
    const { e, pings } = env({ today: () => day });
    const run = activityPinger(e);
    run();
    await settle();
    day = "2026-09-28";
    run();
    await settle();
    expect(pings).toHaveLength(2);
  });

  it("stays quiet while the app is in the background", async () => {
    const { e, pings } = env({ visible: () => false });
    activityPinger(e)();
    await settle();
    expect(pings).toHaveLength(0);
  });

  it("does not write the day off when the ask failed", async () => {
    const { e, store } = env({ ping: async () => Promise.reject(new Error("offline")) });
    activityPinger(e)();
    await settle();
    expect(store.has(ACTIVITY_PING_STORAGE_KEY)).toBe(false);
  });

  it("still asks when storage is refused, and never throws", async () => {
    const { e, pings } = env({
      storage: () => {
        throw new Error("SecurityError");
      },
    });
    expect(() => activityPinger(e)()).not.toThrow();
    await settle();
    expect(pings).toHaveLength(1);
  });
});

describe("where it runs", () => {
  const SRC = join(import.meta.dirname, "..", "..");
  const code = (p: string) =>
    readFileSync(join(SRC, p), "utf8")
      .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, "")
      .replace(/^[ \t]*\/\/.*$/gm, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  it("listens for the app coming back, and stops listening on unmount", () => {
    const ping = code("app/app/activity-ping.tsx");
    expect(ping).toMatch(/document\.addEventListener\("visibilitychange", run\);/);
    expect(ping).toMatch(
      /return \(\) => document\.removeEventListener\("visibilitychange", run\);/,
    );
    expect(ping).toMatch(/visible: \(\) => document\.visibilityState === "visible"/);
    expect(ping).toMatch(/today: \(\) => new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  });

  it("is mounted in the app layout, below the onboarding gate", () => {
    const layout = code("app/app/layout.tsx");
    const gate = layout.indexOf('if (step !== "done") redirect(STEP_ROUTES[step]);');
    const mount = layout.indexOf("<ActivityPing />");
    expect(gate).toBeGreaterThan(-1);
    expect(mount).toBeGreaterThan(gate);
  });

  it("records through the same writer, for a finished member only", () => {
    const action = code("app/app/activity-actions.ts");
    expect(action).toMatch(/if \(!auth\.user\) return;/);
    expect(action).toMatch(/if \(!me\?\.onboarded_at\) return;/);
    expect(action).toMatch(/await recordActivity\(auth\.user\.id\);/);
  });
});

afterEach(() => vi.restoreAllMocks());
