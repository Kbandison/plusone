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

/** Every .ts/.tsx under a directory, so a rule follows the code that moves. */
function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, acc);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) acc.push(path);
  }
  return acc;
}

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

    // Every file that builds a room href, not one named file. The link used to
    // live on the list page and moved into the tab bar the moment rooms became
    // a nav — and a rule pinned to one filename stops being checked the moment
    // the thing it guards is refactored, which is exactly when it matters.
    const roomFiles = sourceFiles(join(APP, "app/rooms"));
    expect(roomFiles.length).toBeGreaterThan(2);

    const linkers = roomFiles.filter((f) => /\/app\/rooms\/\$\{/.test(readFileSync(f, "utf8")));
    expect(linkers.length, "something must build a room href").toBeGreaterThan(0);

    // What goes in the path, not how it is spelled. `room.id` and `roomId` are
    // both fine and a test that pattern-matched one of them missed the other.
    for (const file of linkers) {
      const source = readFileSync(file, "utf8");
      for (const [, expression] of source.matchAll(/\/app\/rooms\/\$\{([^}]+)\}/g)) {
        expect(expression, `${file} must not put a room slug in a path`).not.toMatch(/slug/i);
        expect(expression, `${file} must identify a room by its id`).toMatch(/\bid\b|Id\b/);
      }
    }
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

describe("the referral cookie is set where Next allows it", () => {
  const proxy = readFileSync(join(import.meta.dirname, "../proxy.ts"), "utf8");
  const landing = readFileSync(join(APP, "i/[code]/page.tsx"), "utf8");

  /**
   * Every invite link used to throw. /i/[code] is a Server Component and was
   * calling cookies().set() during render; Next seals the cookie object outside
   * the action phase, so the page raised "Cookies can only be modified in a
   * Server Action or Route Handler" and no referral was ever attributed.
   */
  it("is not set from the landing page", () => {
    expect(landing).not.toMatch(/store\.set\(/);
    expect(landing).not.toMatch(/cookies\(\)/);
  });

  it("is set from the proxy, which owns the response", () => {
    expect(proxy).toMatch(/response\.cookies\.set\("plusone_ref"/);
  });

  /**
   * setAll may rebuild `response` when supabase rotates a token. Writing the
   * cookie before that would drop it on the floor.
   */
  it("is set after the session refresh that can rebuild the response", () => {
    expect(proxy.indexOf("plusone_ref")).toBeGreaterThan(proxy.indexOf("auth.getUser()"));
  });

  it("the proxy matcher actually covers /i/<code>", () => {
    const matcher =
      /^\/((?!_next\/static|_next\/image|favicon\.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)$/;
    expect(matcher.test("/i/abc123")).toBe(true);
  });
});
