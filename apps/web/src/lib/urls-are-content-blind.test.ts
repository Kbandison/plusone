import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONTENT_BLIND_BANNED_TERMS } from "@plusone/config";

/**
 * §8 forbids condition words in "any payload, subject, URL, or analytics event".
 *
 * The rule existed and was only ever applied to notification bodies, which is
 * how /app/rooms/hsv-general and /app/rooms/hiv-u-equals-u shipped — a
 * condition named in browser history, in address-bar autocomplete on a borrowed
 * phone, in our own access logs, and in the Referer of anything the page links
 * out to. Renamed in 20260815000900; this is the half that stops it recurring.
 *
 * A URL travels further than a screen does. The room is still titled "Newly
 * diagnosed" where a member can read it, because naming the subject on the page
 * is the entire point of the page.
 */

const APP = join(import.meta.dirname, "../app");
const SEED = join(import.meta.dirname, "../../../../supabase/migrations/20260813000800_seed.sql");

/** Every route segment, which is every directory under src/app. */
function routeSegments(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    acc.push(entry.name);
    routeSegments(join(dir, entry.name), acc);
  }
  return acc;
}

/** Stems, so "diagnosed" is caught by "diagnosis" and "u-equals-u" by "u=u". */
const PATTERNS = CONTENT_BLIND_BANNED_TERMS.map((term) => {
  const stem = term.replace(/(is|es|s)$/, "").replace(/[^a-z]/g, "");
  return { term, pattern: new RegExp(stem.split("").join("-?"), "i") };
});

const offending = (value: string) =>
  PATTERNS.filter(({ pattern }) => pattern.test(value)).map(({ term }) => term);

describe("URLs are content-blind", () => {
  const segments = routeSegments(APP);

  it("finds the route tree at all", () => {
    // A silent zero here would make every assertion below vacuous.
    expect(segments.length).toBeGreaterThan(20);
    expect(segments).toContain("rooms");
  });

  it.each(segments.map((s) => [s]))("route segment %s names no condition", (segment) => {
    expect(offending(segment), `route segment "${segment}"`).toEqual([]);
  });

  it("names no condition in any seeded room slug", () => {
    const seed = readFileSync(SEED, "utf8");
    const slugs = [...seed.matchAll(/^\s*\('([a-z0-9-]+)',/gm)].map((m) => m[1]!);
    expect(slugs.length, "no slugs found — the seed shape changed").toBeGreaterThanOrEqual(5);
    for (const slug of slugs) {
      expect(offending(slug), `room slug "${slug}"`).toEqual([]);
    }
  });

  it("catches the slugs that actually shipped", () => {
    // The guard is worth nothing if it does not fire on the real cases.
    expect(offending("hsv-general")).toContain("hsv");
    expect(offending("hiv-u-equals-u")).toContain("hiv");
    expect(offending("newly-diagnosed")).toContain("diagnosis");
  });
});
