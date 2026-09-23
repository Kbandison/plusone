import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { lastActiveStamp } from "@plusone/config";

/**
 * last_active_at was never written. Every real member's "last active" was the
 * moment they signed up, so they looked inactive from the next day and dropped
 * out of everybody's Drop after a fortnight. Measured 2026-09-23: 16 of 16.
 */

const calls: { op: string; args: unknown[] }[] = [];
let awaited = false;
let failWith: { code: string } | null = null;
let throwWith: Error | null = null;

vi.mock("./cron", () => ({
  serviceClient: () => {
    const builder: Record<string, unknown> = {};
    for (const op of ["from", "update", "eq", "lt"]) {
      builder[op] = (...args: unknown[]) => {
        calls.push({ op, args });
        return builder;
      };
    }
    // A Postgrest builder is a thenable: nothing is sent unless it is awaited.
    builder["then"] = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
      awaited = true;
      if (throwWith) return reject(throwWith);
      return resolve({ error: failWith });
    };
    return builder;
  },
}));

const { recordActivity } = await import("./last-active");

afterEach(() => {
  calls.length = 0;
  awaited = false;
  failWith = null;
  throwWith = null;
  vi.restoreAllMocks();
});

describe("recording that a member was here", () => {
  const at = new Date("2026-09-23T17:48:31.123Z");

  it("writes the DAY, never the moment", async () => {
    await recordActivity("member-1", at);
    const update = calls.find((c) => c.op === "update");
    expect(update?.args[0]).toEqual({ last_active_at: "2026-09-23T00:00:00.000Z" });
    expect(JSON.stringify(calls)).not.toMatch(/17:48/);
  });

  it("writes only this member, and only once a day", async () => {
    await recordActivity("member-1", at);
    expect(calls.find((c) => c.op === "from")?.args).toEqual(["profiles"]);
    expect(calls.find((c) => c.op === "eq")?.args).toEqual(["id", "member-1"]);
    // The throttle, and the guarantee it never moves backwards.
    expect(calls.find((c) => c.op === "lt")?.args).toEqual([
      "last_active_at",
      "2026-09-23T00:00:00.000Z",
    ]);
  });

  it("actually sends it", async () => {
    await recordActivity("member-1", at);
    expect(awaited).toBe(true);
  });

  it("never throws, and logs no identifier", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    failWith = { code: "42501" };
    await expect(recordActivity("member-1", at)).resolves.toBeUndefined();
    throwWith = new Error("network");
    await expect(recordActivity("member-1", at)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/member-1/);
  });
});

describe("the day stamp", () => {
  it("is midnight UTC, the same all day, and the next day's tomorrow", () => {
    expect(lastActiveStamp(new Date("2026-09-23T00:00:00.000Z"))).toBe("2026-09-23T00:00:00.000Z");
    expect(lastActiveStamp(new Date("2026-09-23T23:59:59.999Z"))).toBe("2026-09-23T00:00:00.000Z");
    expect(lastActiveStamp(new Date("2026-09-24T00:00:00.001Z"))).toBe("2026-09-24T00:00:00.000Z");
  });
});

describe("where it is recorded", () => {
  const SRC = join(import.meta.dirname, "..");
  const read = (p: string) =>
    readFileSync(join(SRC, p), "utf8")
      .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
  const layout = read("app/app/layout.tsx");

  it("records from the app layout, after the response, awaited", () => {
    expect(layout).toMatch(/after\(async \(\) => \{\s*await recordActivity\(userId\);\s*\}\);/);
    expect(layout).toMatch(/const userId = data\.user\.id;/);
  });

  it("records only a member who has finished onboarding", () => {
    // Nobody else is in visible_profiles to be seen as active.
    const gate = layout.indexOf('if (step !== "done") redirect(STEP_ROUTES[step]);');
    expect(gate).toBeGreaterThan(-1);
    // EVERY call, not the first one found. Checking one let a second call
    // above the gate pass while the original sat below it — caught by sabotage.
    const calls = [...layout.matchAll(/recordActivity\(/g)].map((m) => m.index);
    expect(calls.length).toBeGreaterThan(0);
    for (const at of calls) expect(at).toBeGreaterThan(gate);
  });

  it("has one writer, so nothing records a precise moment", () => {
    // A second writer stamping `new Date().toISOString()` would undo the whole
    // reason for the day.
    const writers: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(join(SRC, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
          // WRITES, not the words: `last_active_at: string` in a row type
          // matched the first version of this, the same slip as /confirmed_at:/.
          if (/\.(?:update|insert|upsert)\(\{[^}]*last_active_at/.test(read(rel)))
            writers.push(rel);
        }
      }
    };
    walk("app");
    walk("lib");
    expect(writers).toEqual(["lib/last-active.ts"]);
  });
});
