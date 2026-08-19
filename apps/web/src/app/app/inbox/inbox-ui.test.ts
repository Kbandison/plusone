import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const dialog = read("./decision-dialog.tsx");
const page = read("./page.tsx");
const css = readFileSync(
  fileURLToPath(new URL("../../../styles/globals.css", import.meta.url)),
  "utf8",
);

describe("the decision dialog closes the ways people expect", () => {
  /**
   * A backdrop click targets the DIALOG element itself — ::backdrop is not a
   * node that can be a target — so comparing the target to the dialog is the
   * whole test. `!contains(target)` would close on a click that landed on the
   * dialog's own padding.
   */
  it("closes on a click outside", () => {
    expect(dialog).toMatch(/if \(event\.target === dialog\.current\) dialog\.current\?\.close\(\)/);
  });

  /** method="dialog" closes with no JavaScript of ours, so it works regardless. */
  it("has a close control that needs no script", () => {
    expect(dialog).toMatch(/method="dialog"/);
    expect(dialog).toMatch(/function CloseIcon/);
    expect(dialog).toMatch(/aria-label=\{C\.decisionDismiss\}/);
  });

  it("no longer offers a worded dismiss link", () => {
    expect(dialog).not.toMatch(/Decide later/);
  });
});

describe("the waiting queue", () => {
  /** One heading with the count on it, not a heading and a sentence. */
  it("counts on the heading", () => {
    expect(page).toMatch(/\{C\.threadNeedsDecision\}/);
    expect(page).toMatch(/\{decisions\.length\}/);
    expect(page).not.toMatch(/decisionsHeading/);
  });

  /**
   * The ring is drawn OUTSIDE the bubble, and a scroller with overflow-x also
   * clips vertically — the spec makes overflow-y compute to auto when the other
   * axis is not visible, so there is no way to let it spill. It needs room.
   */
  it("gives the ring vertical room inside the scroller", () => {
    const scroller = /className="[^"]*overflow-x-auto[^"]*"/.exec(page)?.[0] ?? "";
    expect(scroller).toMatch(/py-\d/);
    expect(scroller).not.toMatch(/pb-1\b/);
  });
});

describe("motion", () => {
  /**
   * A dialog cannot transition in without both: `display` and `overlay` are
   * discrete and flip at the start, and a fresh element has no previous state
   * for @starting-style to interpolate from.
   */
  it("lets the dialog animate at all", () => {
    expect(css).toMatch(/allow-discrete/);
    expect(css).toMatch(/@starting-style/);
  });

  /**
   * `animation-duration: 0.01ms` with `both` leaves the element holding its
   * FROM state — invisible content, permanently. Reduced motion has to remove
   * the animation, not shorten it.
   */
  it("removes the arrival for reduced motion rather than shortening it", () => {
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.rise-in\s*\{\s*animation:\s*none/);
  });
});

describe("the chrome kept its size", () => {
  const layout = read("../layout.tsx");
  const links = read("../nav-links.tsx");

  /** Furniture rather than content — shrinking it bought nothing. */
  it("leaves the wordmark, the gear and the bar where they were", () => {
    expect(layout).toMatch(/<Wordmark className="text-\[26px\]" \/>/);
    expect(layout).toMatch(/className="size-\[21px\]"/);
    expect(links).toMatch(/text-\[13px\]/);
  });
});
