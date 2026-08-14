import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { PALETTE, STATUS, type ThemeName, type ThemePalette } from "./index";

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
    expect(css).toContain('(prefers-color-scheme: dark)');
    expect(css).toContain(':root:not([data-theme="light"])');
  });
});
