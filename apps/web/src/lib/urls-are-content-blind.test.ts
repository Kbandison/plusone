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
 * out to.
 *
 * The slugs themselves are NOT the thing to fix: §5.2 names all five
 * explicitly, so they stay. What was wrong is that the identifier and the URL
 * were the same string by default and nobody chose that. Rooms are addressed by
 * id now, and this asserts the link never goes back to the slug.
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

  it("keeps the §5.2 slugs, and keeps them out of the href", () => {
    const seed = readFileSync(SEED, "utf8");
    const slugs = [...seed.matchAll(/^\s*\('([a-z0-9-]+)',/gm)].map((m) => m[1]!);
    // The spec names these. They are identifiers; the URL is the thing §8
    // constrains, and it is now the room id.
    expect(slugs).toContain("hsv-general");
    expect(slugs).toContain("hiv-u-equals-u");

    const list = readFileSync(join(APP, "app/rooms/page.tsx"), "utf8");
    expect(list, "the rooms list must not link by slug").not.toMatch(/\/app\/rooms\/\$\{room\.slug/);
    expect(list).toMatch(/\/app\/rooms\/\$\{room\.id/);
  });

  it("has no route segment that takes a slug for a room", () => {
    // The dynamic segment is the URL. Naming it [slug] is what made the slug
    // the address in the first place.
    expect(segments).toContain("[roomId]");
    expect(segments).not.toContain("[slug]");
  });

  it("catches the slugs that actually shipped", () => {
    // The guard is worth nothing if it does not fire on the real cases.
    expect(offending("hsv-general")).toContain("hsv");
    expect(offending("hiv-u-equals-u")).toContain("hiv");
    expect(offending("newly-diagnosed")).toContain("diagnosis");
  });
});
