import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The bottom nav is the only navigation in the app, and it was unusable on a
 * phone.
 *
 * Nine labels in `justify-between` came to roughly 360px of text inside the
 * 312px a 360px screen leaves after the gutters, and `body { overflow-x:
 * hidden }` in globals.css meant the overflow was clipped rather than
 * scrollable — the last items were simply unreachable, and nothing said so,
 * because clipping never does.
 *
 * These assert the two properties that keep it usable rather than trying to
 * measure layout in a test runner: it wraps, and each link carries its own
 * padding so the target is not a bare 13px line box.
 */

const LAYOUT = readFileSync(join(import.meta.dirname, "layout.tsx"), "utf8");
const GLOBALS = readFileSync(join(import.meta.dirname, "../../styles/globals.css"), "utf8");

describe("the bottom nav", () => {
  it("has the destinations we think it has", () => {
    const items = [...LAYOUT.matchAll(/\{ href: "([^"]+)"/g)].map((m) => m[1]!);
    expect(items.length).toBeGreaterThanOrEqual(9);
    expect(items).toContain("/app");
    expect(items).toContain("/app/settings");
  });

  it("wraps rather than overflowing, because the overflow is clipped", () => {
    // The clipping is real and is not going away — it is what stops horizontal
    // page scroll everywhere else.
    expect(GLOBALS).toMatch(/overflow-x:\s*hidden/);
    const list = /<ul className="([^"]+)"/.exec(LAYOUT)?.[1] ?? "";
    expect(list, "the nav list must wrap").toMatch(/flex-wrap/);
  });

  it("gives each link its own padding, so the target is not a bare line box", () => {
    // WCAG 2.2 SC 2.5.8 wants 24x24 CSS px. Padding on the <ul> gives the
    // links none of it.
    const link = /<Link\s+href=\{item\.href\}\s+className="([^"]+)"/.exec(LAYOUT)?.[1] ?? "";
    expect(link, "no link className found — the nav shape changed").not.toBe("");
    expect(link).toMatch(/min-h-\[\d+px\]/);
    expect(link).toMatch(/px-\d/);

    const minHeight = Number(/min-h-\[(\d+)px\]/.exec(link)?.[1] ?? 0);
    expect(minHeight).toBeGreaterThanOrEqual(24);
  });
});
