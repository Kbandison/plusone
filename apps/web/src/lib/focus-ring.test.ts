import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const APP = join(import.meta.dirname, "../app");

function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) tsxFiles(path, acc);
    else if (entry.name.endsWith(".tsx")) acc.push(path);
  }
  return acc;
}

/**
 * globals.css defines `:focus-visible { outline: 2px solid var(--accent) }` under
 * a comment calling it "required by the LuxWeb accessibility gate". Twenty-four
 * controls across seventeen files then carried `focus:outline-none`, and
 * Tailwind utilities sit in a later cascade layer than the base rule — so the
 * ring was cancelled on almost every input, select and outline button in the
 * app, and replaced with a one-pixel border tint that is well under 3:1.
 *
 * A keyboard user could not see where they were.
 */
describe("the keyboard focus ring is not cancelled", () => {
  const files = tsxFiles(APP).concat(join(APP, "auth-fields.tsx"));

  it("appears on no interactive control", () => {
    const offenders = files.filter((f) => {
      const source = readFileSync(f, "utf8");
      if (!source.includes("focus:outline-none")) return false;
      // A container focused programmatically — so a screen reader announces it —
      // is the one place suppressing the ring is right: the member did not move
      // focus there themselves.
      return !source.includes("tabIndex={-1}");
    });

    expect(offenders.map((f) => f.replace(APP, "app"))).toEqual([]);
  });
});
