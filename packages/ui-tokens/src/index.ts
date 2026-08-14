/**
 * Plus One design tokens.
 *
 * Direction locked 2026-08-13: Luxury Minimal × Soft Consumer — structure from the
 * first, temperature from the second. Linen is the light theme, Dusk is the dark one.
 * The type system does NOT fork by theme; only color does.
 *
 * Dials: VARIANCE 5 / MOTION 6 / DENSITY 3.
 *
 * Every value in PALETTE was verified against WCAG 2.2 AA on its own ground —
 * see tokens.test.ts, which recomputes the ratios rather than trusting a comment.
 */

export type ThemeName = "linen" | "dusk";

export interface ThemePalette {
  /** Page ground. */
  ground: string;
  /** Raised surfaces — cards, inputs, sheets. */
  surface: string;
  /** Recessed or secondary fills — badges, track backgrounds. */
  surface2: string;
  /** Primary body and heading text. */
  ink: string;
  /** Secondary text. Passes AA on `ground`. */
  ink2: string;
  /** Tertiary text — labels, captions, metadata. Passes AA on `ground`. */
  ink3: string;
  /** The single accent. CTAs, links, highlights, interactive states — never large fills. */
  accent: string;
  /** Text/icon color that sits ON the accent. */
  accentInk: string;
  /** Decorative only — gradient blocks and photo placeholders. Never carries text. */
  plum: string;
  /** Hairlines and borders. */
  line: string;
  line2: string;
}

export const PALETTE: Record<ThemeName, ThemePalette> = {
  linen: {
    ground: "#F4EFE7",
    surface: "#FBF8F3",
    surface2: "#EFE8DC",
    ink: "#1C1917",
    ink2: "#6B6259",
    ink3: "#766B60",
    // Deepened from the original #B5674A, which measured 3.67:1 as text — under AA.
    accent: "#9F5B41",
    accentInk: "#FBF8F3",
    plum: "#5C4438",
    line: "rgba(28, 25, 23, 0.13)",
    line2: "rgba(28, 25, 23, 0.07)",
  },
  dusk: {
    ground: "#14110F",
    surface: "#1B1714",
    surface2: "#241E1A",
    ink: "#EDE7DE",
    ink2: "#A79C90",
    // Solved against the raised surface, not the page ground. On Dusk the card
    // surface is LIGHTER than the ground, so it is the harder of the two — the
    // ground-only value (#877A6E) measured 4.27:1 on cards and failed AA.
    ink3: "#8D8074",
    accent: "#D69A4E",
    accentInk: "#14110F",
    plum: "#4A3340",
    line: "rgba(237, 231, 222, 0.12)",
    line2: "rgba(237, 231, 222, 0.06)",
  },
};

/**
 * Semantic status colors. Separate from the accent so "warning" never competes
 * with a CTA. Deliberately desaturated to sit inside the warm palette.
 */
export const STATUS = {
  linen: { positive: "#3F6B4A", caution: "#8A6516", critical: "#9B3B2F" },
  dusk: { positive: "#7FB08C", caution: "#D2A63E", critical: "#D97A6C" },
} as const;

/** Instrument Serif for display, Satoshi for everything else. Constant across themes. */
export const FONTS = {
  display: "var(--font-display), ui-serif, Georgia, serif",
  body: "var(--font-body), ui-sans-serif, system-ui, sans-serif",
} as const;

/**
 * Type scale. Display sizes use clamp so they breathe on desktop without a media
 * query. Body floors at 17px — 16 is the LuxWeb minimum and this product is read
 * carefully, often at night.
 */
export const TYPE = {
  hero: { size: "clamp(2.6rem, 6.4vw, 4.6rem)", lineHeight: "1.04", letterSpacing: "-0.022em" },
  h1: { size: "clamp(2.3rem, 5.4vw, 3.9rem)", lineHeight: "1.05", letterSpacing: "-0.022em" },
  h2: { size: "clamp(1.8rem, 3.2vw, 2.5rem)", lineHeight: "1.08", letterSpacing: "-0.02em" },
  h3: { size: "clamp(1.4rem, 1.9vw, 1.75rem)", lineHeight: "1.1", letterSpacing: "-0.018em" },
  body: { size: "17px", lineHeight: "1.65", letterSpacing: "normal" },
  bodySm: { size: "14.5px", lineHeight: "1.62", letterSpacing: "normal" },
  label: { size: "11.5px", lineHeight: "1.4", letterSpacing: "0.14em" },
} as const;

/**
 * DENSITY 3 — sections breathe. Max content width sits at the low end of the
 * LuxWeb 1–3 band because this app is read, not scanned.
 */
export const LAYOUT = {
  sectionPaddingY: "clamp(52px, 7vw, 92px)",
  contentMaxWidth: "1080px",
  proseMaxWidth: "62ch",
  gutter: "clamp(20px, 4vw, 40px)",
  /** Minimum tap target — LuxWeb responsive audit requires 44px on mobile. */
  minTapTarget: "44px",
} as const;

/**
 * One radius scale, varied by element. Uniform radius on everything is anti-slop #4.
 */
export const RADII = {
  xs: "3px",
  sm: "7px",
  md: "12px",
  lg: "16px",
  xl: "18px",
  pill: "999px",
} as const;

/**
 * MOTION 6 — scroll-fade entrances and staggered reveals, transform/opacity only,
 * fired once. Never bounce or elastic on content (anti-slop #25).
 */
export const MOTION = {
  ease: "cubic-bezier(0.22, 0.61, 0.24, 1)",
  easeOut: "cubic-bezier(0.2, 0.6, 0.2, 1)",
  durationFast: "250ms",
  durationBase: "420ms",
  durationReveal: "740ms",
  staggerStep: "90ms",
  revealOffset: "16px",
} as const;

/** Attribute the theme is stamped on `<html>` with. */
export const THEME_ATTRIBUTE = "data-theme" as const;
export const THEME_STORAGE_KEY = "plusone.theme" as const;
