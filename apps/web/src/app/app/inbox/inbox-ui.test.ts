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
    // CloseIcon moved to the shared modal when a second dialog needed it.
    expect(dialog).toMatch(/import \{ CloseIcon \} from "@\/app\/modal"/);
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
   *
   * Repinned 2026-09-02: `.page-enter` joined `.rise-in` in the same rule, so
   * the selector is followed by a comma rather than a brace. Both are matched
   * individually now, because they share the hazard and not the shape — every
   * animation using `fill-mode: both` has to be listed here, and a new one that
   * is not will hide its element from anybody who asked for less motion.
   */
  it("removes the arrival for reduced motion rather than shortening it", () => {
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    const removed = /([^}]*)\{\s*animation:\s*none/.exec(reduced)?.[1] ?? "";
    expect(removed).toMatch(/\.rise-in\b/);
    expect(removed).toMatch(/\.page-enter\b/);
  });

  /**
   * The list above is only correct while it is complete. Every `both` in the
   * stylesheet must appear in it, or that animation freezes its element in the
   * FROM state — which for an entrance means invisible, permanently, for the
   * member who asked for no motion.
   */
  it("lists every fill-mode: both animation in that rule", () => {
    const classes = [...css.matchAll(/^\.([a-z-]+)\s*\{\s*animation:[^;]*\bboth\b/gm)].map(
      (m) => m[1],
    );
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    const removed = /([^}]*)\{\s*animation:\s*none/.exec(reduced)?.[1] ?? "";
    const missing = classes.filter((name) => !new RegExp(`\\.${name}\\b`).test(removed));
    expect(missing).toEqual([]);
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

/**
 * The page's h1 and the queue's h2 both read "Waiting on you" — one naming the
 * screen and one naming a section of it. The h1 was written when this screen
 * held pending connects and nothing else; once chats folded in it stopped
 * describing the page.
 */
describe("the headings say different things", () => {
  it("names the page and the section differently", () => {
    const config = readFileSync(
      fileURLToPath(
        new URL("../../../../../../packages/config/src/draft-copy.ts", import.meta.url),
      ),
      "utf8",
    );
    const inboxHeading = /inboxHeading: "([^"]+)"/.exec(config)?.[1];
    const decisionHeading = /threadNeedsDecision: "([^"]+)"/.exec(config)?.[1];
    expect(inboxHeading).toBeTruthy();
    expect(decisionHeading).toBeTruthy();
    expect(inboxHeading).not.toBe(decisionHeading);
  });
});

/**
 * Reported: the threads waiting for a response could not be opened.
 *
 * `href` was set only for chats, so a connect the member had SENT rendered as a
 * plain div — no link, no button, nothing to press. A thread you cannot open is
 * a thread you cannot re-read, and what you wrote to somebody is the one thing
 * you might want to check while you are waiting on them.
 */
describe("every row can be opened", () => {
  const row = read("./thread-row.tsx");

  it("gives a sent connect something to press", () => {
    expect(row).toMatch(/if \(thread\.sent\) \{/);
    expect(row).toMatch(/onClick=\{\(\) => dialog\.current\?\.showModal\(\)\}/);
    expect(row).not.toMatch(/<div className="flex items-start gap-3\.5 rounded-xl/);
  });

  it("carries what was written so it can be read back", () => {
    expect(page).toMatch(/question: promptQuestion\(connectById/);
    expect(page).toMatch(/reply: connectById\.get\(thread\.id\)!\.prompt_reply/);
    expect(row).toMatch(/thread\.sent\.reply/);
  });

  /** Same dismissal as the decision dialog: a click outside, and an X. */
  it("closes the same ways the decision dialog does", () => {
    expect(row).toMatch(/if \(event\.target === dialog\.current\) dialog\.current\?\.close\(\)/);
    expect(row).toMatch(/method="dialog"/);
  });

  /** Read-only. Nothing here accepts, declines or withdraws anything. */
  it("offers no action it cannot honour", () => {
    const sentBlock = row.slice(
      row.indexOf("if (thread.sent) {"),
      row.indexOf("return (\n    <li>"),
    );
    expect(sentBlock).not.toMatch(/AcceptForm|DeclineForm/);
  });
});
