import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { LAYOUT, PALETTE, STATUS, TYPE, type ThemeName, type ThemePalette } from "./index";

/**
 * Contrast is verified by recomputation, not by trusting a comment. LuxWeb targets
 * WCAG 2.2 AA, and the EAA makes this a legal requirement for EU users.
 *
 * AA thresholds: 4.5:1 for body text, 3:1 for large text and UI components.
 */

function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const channels = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const [r, g, b] = linear as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const THEMES: ThemeName[] = ["linen", "dusk"];
const AA_TEXT = 4.5;
const AA_UI = 3;

describe.each(THEMES)("%s theme meets WCAG 2.2 AA", (theme) => {
  const p: ThemePalette = PALETTE[theme];

  it("body ink on ground", () => {
    expect(contrastRatio(p.ink, p.ground)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("body ink on raised surface", () => {
    expect(contrastRatio(p.ink, p.surface)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("secondary text on ground", () => {
    expect(contrastRatio(p.ink2, p.ground)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("tertiary text on ground — labels and captions are still text", () => {
    expect(contrastRatio(p.ink3, p.ground)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("tertiary text on raised surface", () => {
    expect(contrastRatio(p.ink3, p.surface)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("accent as link text on ground", () => {
    expect(contrastRatio(p.accent, p.ground)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("accent as link text on raised surface", () => {
    expect(contrastRatio(p.accent, p.surface)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("button label on accent ground", () => {
    expect(contrastRatio(p.accentInk, p.accent)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("accent as a UI component boundary", () => {
    expect(contrastRatio(p.accent, p.ground)).toBeGreaterThanOrEqual(AA_UI);
  });

  it.each(["positive", "caution", "critical"] as const)(
    "%s status color reads on ground",
    (key) => {
      expect(contrastRatio(STATUS[theme][key], p.ground)).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );

  it.each(["positive", "caution", "critical"] as const)(
    "%s status color reads on raised surface",
    (key) => {
      // Status chips live on cards, not on the page ground. On Dusk the surface
      // is the lighter of the two and therefore the harder test.
      expect(contrastRatio(STATUS[theme][key], p.surface)).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );
});

describe("palette discipline", () => {
  it("never uses pure black or pure white (anti-slop #19)", () => {
    for (const theme of THEMES) {
      const p = PALETTE[theme];
      for (const value of [p.ground, p.surface, p.surface2, p.ink, p.accent]) {
        expect(value.toLowerCase()).not.toBe("#000000");
        expect(value.toLowerCase()).not.toBe("#ffffff");
      }
    }
  });

  it("carries exactly one accent per theme", () => {
    // LuxWeb color rule #2. `plum` is decorative-only and never an interactive color.
    for (const theme of THEMES) {
      expect(PALETTE[theme].accent).toBeTruthy();
    }
    expect(PALETTE.linen.accent).not.toBe(PALETTE.dusk.accent);
  });
});

describe("tokens.css stays in sync with the TypeScript palette", () => {
  const css = readFileSync(fileURLToPath(new URL("../tokens.css", import.meta.url)), "utf8");

  it("defines the complete light palette on bare :root", () => {
    // A token whose only definition sits behind a media query is the classic
    // unreadable-theme bug. Every key must appear in the bare :root block.
    const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf("@media"));
    for (const key of ["--ground", "--surface", "--ink", "--ink-2", "--ink-3", "--accent"]) {
      expect(rootBlock).toContain(`${key}:`);
    }
  });

  it("ships every light value from PALETTE.linen", () => {
    for (const value of Object.values(PALETTE.linen)) {
      if (value.startsWith("#")) expect(css).toContain(value.toLowerCase());
    }
  });

  it("ships every dark value from PALETTE.dusk", () => {
    for (const value of Object.values(PALETTE.dusk)) {
      if (value.startsWith("#")) expect(css).toContain(value.toLowerCase());
    }
  });

  it("guards the dark media query against an explicit light choice", () => {
    expect(css).toContain("(prefers-color-scheme: dark)");
    expect(css).toContain(':root:not([data-theme="light"])');
  });
});

describe("the two dark blocks agree", () => {
  const css = readFileSync(fileURLToPath(new URL("../tokens.css", import.meta.url)), "utf8");

  /**
   * They did not. `--ink-3` was #8d8074 in the media query and #877a6e in the
   * attribute selector — and the two have identical specificity (0,2,0), so the
   * attribute block won by source order and the corrected value was unreachable.
   * The older one is the value this file's own comment documents as failing AA.
   *
   * A duplicated declaration list is a duplicated decision. This asserts they
   * never drift again, whichever one someone edits.
   */
  it("declares identical values in the media query and the [data-theme] block", () => {
    const media = css.slice(
      css.indexOf("@media (prefers-color-scheme: dark)"),
      css.indexOf(':root[data-theme="dark"]'),
    );
    const attr = css.slice(css.indexOf(':root[data-theme="dark"]'));

    const read = (block: string, name: string) =>
      new RegExp(`${name}:\\s*([^;]+);`).exec(block)?.[1]?.trim();

    for (const token of [
      "--ground",
      "--surface",
      "--surface-2",
      "--ink",
      "--ink-2",
      "--ink-3",
      "--accent",
      "--accent-ink",
      "--positive",
      "--caution",
      "--critical",
    ]) {
      expect(read(attr, token), `${token} differs between the two dark blocks`).toBe(
        read(media, token),
      );
    }
  });
});

describe("the type scale reaches the app", () => {
  const css = readFileSync(fileURLToPath(new URL("../tokens.css", import.meta.url)), "utf8");

  /**
   * TYPE existed only as TypeScript that nothing imported, so 35 one-off
   * arbitrary font sizes shipped and the scale was documentation. It is
   * registered under @theme inline now — which means two copies of the same
   * numbers, and this is what keeps them the same numbers.
   */
  it.each([
    ["hero", TYPE.hero],
    ["h1", TYPE.h1],
    ["h2", TYPE.h2],
    ["h3", TYPE.h3],
    ["body", TYPE.body],
    ["label", TYPE.label],
  ])("--text-%s matches TYPE", (name, step) => {
    const declared = new RegExp(`--text-${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim();
    expect(declared, `--text-${name} is not registered`).toBe(step.size);
  });

  it("registers the 44px tap floor LAYOUT declares", () => {
    expect(/--spacing-tap:\s*([^;]+);/.exec(css)?.[1]?.trim()).toBe(LAYOUT.minTapTarget);
  });

  /**
   * WCAG 1.4.11 wants 3:1 for the boundary of a control. --line-2 is about
   * 1.15:1 against its own fill — fine for a decorative card edge, invisible as
   * the edge of an input somebody has to find.
   */
  it("declares a control boundary distinct from the decorative one, in all three theme states", () => {
    expect((css.match(/--line-control:/g) ?? []).length).toBe(3);
    expect(css).toMatch(/--color-line-control:\s*var\(--line-control\)/);
  });
});
