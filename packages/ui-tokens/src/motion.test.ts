import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MOTION } from "./index";

/**
 * The motion scale, and the reason this file exists.
 *
 * Until 2026-09-02 `MOTION` was fiction. It declared 250 / 420 / 740 and a
 * stagger step, and NOTHING read it — no import, no CSS variable, no test.
 * Meanwhile 108 components had typed `duration-200`, because Tailwind's default
 * was the only thing reachable: the durations were never exposed as custom
 * properties, so a component could not have used them if it tried.
 *
 * Two vocabularies, then. The one written down that nobody used, and the one in
 * use that nobody wrote down. Exactly the shape `copy-is-wired.test.ts` catches
 * for copy — a decision recorded and never wired — one layer over.
 *
 * So these assertions are about REACHABILITY as much as agreement. A token
 * nothing can read is not a token.
 */
const HERE = import.meta.dirname;
const tokensCss = readFileSync(join(HERE, "../tokens.css"), "utf8");
const WEB = join(HERE, "../../../apps/web/src");

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, acc);
    else if (/\.tsx?$/.test(entry.name)) acc.push(path);
  }
  return acc;
}

describe("the motion scale is reachable and agreed", () => {
  /** A duration that exists only in TypeScript cannot be used by a stylesheet. */
  it("exposes every duration as a custom property", () => {
    expect(tokensCss).toMatch(new RegExp(`--duration-fast:\\s*${MOTION.durationFast};`));
    expect(tokensCss).toMatch(new RegExp(`--duration-base:\\s*${MOTION.durationBase};`));
    expect(tokensCss).toMatch(new RegExp(`--duration-slow:\\s*${MOTION.durationSlow};`));
  });

  /**
   * Tailwind's `duration-300` is 300ms, which IS `--duration-base`. The class is
   * allowed because it reads better than an arbitrary value in 108 places — but
   * only while the two are the same number, which is what this pins.
   */
  it("keeps duration-300 equal to the base token", () => {
    expect(MOTION.durationBase).toBe("300ms");
  });

  /**
   * The stagger token described a stagger the Drop deliberately does not have:
   * globals.css argues a list dealing itself in draws the eye to the animation
   * rather than to what arrived, and it is the same three faces every night. A
   * token for a rejected idea is an invitation to build it.
   */
  it("does not carry a token for the stagger that was rejected", () => {
    expect(MOTION).not.toHaveProperty("staggerStep");
  });
});

describe("components stay on the scale", () => {
  const files = sourceFiles(WEB);
  const durations = files.flatMap((path) => {
    const source = readFileSync(path, "utf8");
    // Digits, or a bracketed arbitrary value. An earlier version allowed
    // whitespace inside the class and matched "300 hover" — the next word in
    // the className — which reported all 108 as off-scale.
    return [...source.matchAll(/duration-(\d+|\[[^\]]+\])/g)].map((m) => ({
      // The capture group is always present when the regex matches; `?? ""`
      // satisfies noUncheckedIndexedAccess without inventing a fallback that
      // could pass as a real value.
      value: m[1] ?? "",
      file: path.slice(WEB.length + 1),
    }));
  });

  /**
   * Off-scale durations are how the old spread happened: 150, 180, 200, 260,
   * 300, 340 all coexisting because each was chosen locally and nothing said
   * what the vocabulary was.
   */
  it("uses only the base class or an explicit token variable", () => {
    const allowed = new Set([
      "300",
      "[var(--duration-fast)]",
      "[var(--duration-base)]",
      "[var(--duration-slow)]",
    ]);
    const offScale = durations.filter((d) => !allowed.has(d.value));
    // Named, so a failure says which file to open.
    expect(offScale.map((d) => `${d.file}: duration-${d.value}`)).toEqual([]);
  });

  /**
   * `transition-all` animates every property that changes, including ones that
   * force layout. There were none across 109 transitions before this file
   * existed, which is unusual and worth keeping that way.
   */
  it("never transitions everything", () => {
    const offenders = files
      .filter((path) => /transition-all/.test(readFileSync(path, "utf8")))
      .map((path) => path.slice(WEB.length + 1));
    expect(offenders).toEqual([]);
  });
});
