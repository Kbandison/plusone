import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const APP = join(import.meta.dirname, "../app");

function tsx(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) tsx(path, acc);
    else if (entry.name.endsWith(".tsx")) acc.push(path);
  }
  return acc;
}

const files = tsx(APP);
const read = (f: string) =>
  readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

describe("one definition per primitive", () => {
  /**
   * A design review counted thirteen spellings of the primary button across
   * twenty-five files, fifteen of the card and four of the wordmark. The
   * focus-ring bug fixed the same morning was present in twenty-three of them —
   * which is the cost of a duplicated primitive, stated exactly.
   */
  it("no file spells the primary button by hand", () => {
    const offenders = files
      .filter((f) => !f.endsWith("ui.tsx"))
      .filter((f) => /className="[^"]*\bbg-accent\b[^"]*\bpx-\d/.test(read(f)));
    expect(offenders.map((f) => f.replace(APP, "app"))).toEqual([]);
  });

  it("no file draws the wordmark by hand", () => {
    const offenders = files
      .filter((f) => !f.endsWith("ui.tsx"))
      .filter((f) => read(f).includes("align-super"));
    expect(offenders.map((f) => f.replace(APP, "app"))).toEqual([]);
  });
});

describe("controls meet the accessibility floors", () => {
  /**
   * iOS Safari zooms the viewport when a focused control's font-size is under
   * 16px, and the app sets no maximum-scale (nor should it). Fourteen fields
   * were at 15px, so focusing them jumped the page.
   */
  it("no focusable field is under 16px", () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const match of read(f).matchAll(/<(input|textarea|select)\b[\s\S]{0,700}?\/?>/g)) {
        const size = /text-\[(\d+(?:\.\d+)?)px\]/.exec(match[0]);
        if (size && Number(size[1]) < 16) offenders.push(f.replace(APP, "app"));
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * LAYOUT.minTapTarget declares 44px and it was honoured in exactly one place
   * in the whole app. `min-h-tap` is that token, registered in tokens.css.
   */
  it("the tap floor is used, not just declared", () => {
    const used = files.filter((f) => read(f).includes("min-h-tap")).length;
    expect(used).toBeGreaterThan(5);
  });
});

describe("the accent is not a large fill", () => {
  /**
   * The token file's own contract: "CTAs, links, highlights, interactive states
   * — never large fills". A column of accent-filled chat bubbles was the largest
   * fill in the app.
   */
  it("no message bubble is filled with it", () => {
    const chat = read(join(APP, "app/chats/[id]/page.tsx"));
    expect(chat).not.toMatch(/bg-accent[^"]*text-accent-ink/);
  });
});
