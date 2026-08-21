import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Overrides passed to buttonClass that the cascade throws away.
 *
 * Tailwind resolves two utilities setting the same property by their order in
 * the GENERATED STYLESHEET, not by their order in the class attribute. SHAPE
 * carries `px-5`; `.px-5` is emitted after `.px-0`, so `buttonClass(tone,
 * "px-0")` produced a button with twenty pixels of padding a side.
 *
 * That is what made the microphone invisible: a 44px box, 40px of padding and
 * 2px of border left two pixels of content, and an SVG is a shrinkable flex
 * item. The icon was there the whole time, squeezed to nothing — so raising it
 * from 17px to 22px changed exactly nothing, twice.
 *
 * Nothing in a build catches this. The class is present in the markup, the
 * utility exists in the stylesheet, and the rule simply loses. This catches it.
 */

const ROOT = join(import.meta.dirname, "..");

/** Utilities in SHAPE that an extra argument cannot win against. */
const HELD_BY_SHAPE = ["px", "text", "rounded", "min-h"];

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(path, acc);
      continue;
    }
    if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) acc.push(path);
  }
  return acc;
}

describe("no buttonClass override that the cascade discards", () => {
  const files = sourceFiles(ROOT);

  it.each(HELD_BY_SHAPE)("never overrides %s through the extra argument", (prefix) => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const call of source.matchAll(/buttonClass\(\s*"[a-z]+"\s*,\s*"([^"]*)"/g)) {
        const clashes = call[1]!
          .split(/\s+/)
          .filter((c) => new RegExp(`^${prefix}-`).test(c.replace(/^[a-z-]+:/, "")));
        if (clashes.length) offenders.push(`${file.slice(ROOT.length + 1)}: ${clashes.join(" ")}`);
      }
    }

    // iconButtonClass exists for the square-glyph case; a shape that SHAPE
    // cannot express needs its own builder, not an argument that loses.
    expect(offenders).toEqual([]);
  });

  /** The shape that made the override necessary, built without one. */
  it("builds the icon button with no padding to argue with", () => {
    const ui = readFileSync(join(ROOT, "app/ui.tsx"), "utf8");
    const icon = ui.slice(ui.indexOf("export function iconButtonClass"));
    // Up to the closing brace of the function, not the first `}` in the file —
    // the template literal it returns is full of them.
    expect(icon.slice(0, icon.indexOf("\n}"))).not.toMatch(/px-/);
    expect(icon).toMatch(/size-tap shrink-0/);
  });

  /** And an SVG in a flex row shrinks unless told not to. */
  it("keeps every chat icon unshrinkable", () => {
    const icons = readFileSync(join(ROOT, "app/app/chats/[id]/chat-icons.tsx"), "utf8");
    const sized = icons.match(/className="size-\[\d+px\][^"]*"/g) ?? [];
    // Four since the composer gained a photo picker beside the mic.
    expect(sized).toHaveLength(4);
    for (const c of sized) expect(c).toMatch(/shrink-0/);
  });
});
