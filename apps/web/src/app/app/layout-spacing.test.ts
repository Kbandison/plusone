import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const APP = join(import.meta.dirname);
const layout = readFileSync(join(APP, "layout.tsx"), "utf8");
const rooms = readFileSync(join(APP, "rooms/layout.tsx"), "utf8");
const globals = readFileSync(join(APP, "../../styles/globals.css"), "utf8");
const appHeader = readFileSync(join(APP, "app-header.tsx"), "utf8");

/**
 * Just the class attributes.
 *
 * Not fussiness: `expect(layout).toMatch(/pointer-events-auto/)` passed against
 * a file where the class had been DELETED, because the comment explaining why
 * the class is there still said the words. A sabotage is what found it. This
 * repo has now lost that one six times, and the shape is always the same — a
 * guard that greps a source file is a guard that reads its own documentation.
 *
 * A floor comes with it below, because a regex that stops matching anything
 * makes every assertion built on it trivially true.
 */
function classAttrs(src: string): string {
  return (src.match(/className="[^"]*"/g) ?? []).join("\n");
}
const layoutClasses = classAttrs(layout);
const headerClasses = classAttrs(appHeader);

function pages(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) pages(path, acc);
    else if (entry.name === "page.tsx") acc.push(path);
  }
  return acc;
}

/**
 * A page's heading was sitting on the wordmark.
 *
 * The space belongs in the layout because no page carries a top margin of its
 * own — and the moment two of them do, they will disagree, which is how a set
 * of screens ends up with four different gaps under the same header.
 */
describe("there is air under the chrome", () => {
  /**
   * --nav-h is how tall the bar IS. Clearance is a different number: a page
   * whose last line ends exactly at the top of the nav has not been given room,
   * it has been given none. One value doing both jobs left a band of empty page
   * between the chat composer and the bar it was meant to sit on.
   */
  it("puts the gap in the layout's content wrapper", () => {
    expect(layout).toMatch(/className="flex-1 pt-6 pb-\[calc\(var\(--nav-h\)\+1\.5rem\)\]"/);
  });

  /**
   * The real height cannot be written down: the row wraps when five labels do
   * not fit, which depends on the labels, the font and the phone. So the
   * stylesheet holds a first-paint value and the bar is measured on mount.
   */
  it("measures the bar rather than guessing at it", () => {
    // Generalised when the chat composer needed the same treatment — its height
    // is unwritable for the same reason the nav's is.
    const measure = readFileSync(join(APP, "publish-height.tsx"), "utf8");
    expect(measure).toMatch(/new ResizeObserver\(publish\)/);
    expect(measure).toMatch(/setProperty\(cssVar, `\$\{element\.offsetHeight\}px`\)/);
    expect(layout).toMatch(/<PublishHeight targetId=\{NAV_ID\} cssVar="--nav-h" \/>/);
    expect(layout).toMatch(/id=\{NAV_ID\}/);
  });

  /**
   * A frame of gap is a gap; a frame of overlap hides the control a member is
   * reaching for. So the pre-measurement value errs high where the bar wraps.
   */
  it("keeps a first-paint value that errs high on narrow screens", () => {
    expect(globals).toMatch(/--nav-h: 6\.5rem/);
    expect(globals).toMatch(/min-width: 640px[\s\S]{0,80}--nav-h: 3\.5625rem/);
  });

  /** The tab bar is a second piece of chrome, so it needs the same gap again. */
  it("repeats it under the room tabs", () => {
    expect(rooms).toMatch(/<div className="pt-6">\{children\}<\/div>/);
  });

  /**
   * And no page adds its own on top. One of these disagreeing with the layout
   * is the bug this replaced, arriving from the other direction.
   */
  it("leaves every page's first heading unmargined", () => {
    for (const file of pages(APP)) {
      const source = readFileSync(file, "utf8");
      const main = source.indexOf('<main id="main">');
      if (main === -1) continue;
      const firstHeading = source.slice(main, main + 400).match(/<h1[^>]*className="([^"]*)"/);
      if (!firstHeading) continue;
      expect(firstHeading[1], `${file} adds a top margin the layout already gives`).not.toMatch(
        /\bmt-\d/,
      );
    }
  });
});

/**
 * An overflow set on BODY alone propagates to the viewport, and the propagation
 * leaves body's own overflow computing to `visible` — so body stops clipping
 * anything, and a child wider than the screen makes the page pannable on a
 * phone even though the rule looks like it should have stopped it.
 */
describe("nothing is wider than the phone", () => {
  const css = readFileSync(join(APP, "../../styles/globals.css"), "utf8");
  const row = readFileSync(join(APP, "rooms/[roomId]/post-row.tsx"), "utf8");

  it("clips on html as well as on body", () => {
    expect(css).toMatch(/html \{[\s\S]*?overflow-x: clip;/);
    expect(css).toMatch(/body \{[\s\S]*?overflow-x: clip;/);
  });

  /** hidden makes a scroll container; clip does not. */
  it("uses clip rather than hidden", () => {
    expect(css).not.toMatch(/overflow-x: hidden/);
  });

  /** A pasted link in a post, or a URL inside a feed's summary. */
  it("breaks a word too long for the column", () => {
    expect(row).toMatch(/break-words whitespace-pre-wrap/);
  });

  /** Like, comments, share, reply and the view count. */
  it("wraps the controls under a post rather than widening the row", () => {
    expect(row).toMatch(/flex flex-wrap items-center gap-x-5 gap-y-1/);
  });
});

/**
 * The pinned header, and the two things about it that fail in silence.
 *
 * Kevin's call 2026-09-15, picked from a working mock: the bar stays put, the
 * wordmark leaves, the controls collect into a pill. What makes it safe is not
 * the look, and neither of the two load-bearing parts shows up on a screenshot.
 */
describe("the pinned header does not eat the page", () => {
  it("finds the classes at all", () => {
    // The floor. Without it every assertion below is satisfied by an empty
    // string the moment the className regex stops matching.
    expect(headerClasses).toMatch(/flex items-center/);
    expect(layoutClasses.length).toBeGreaterThan(400);
  });

  it("is actually pinned", () => {
    expect(headerClasses).toMatch(/sticky top-0/);
    // Above the feed rows, which became `relative z-10` when a whole post was
    // made clickable and painted straight over the chrome once before.
    expect(headerClasses).toMatch(/z-30/);
  });

  it("stops taking pointer events once it is transparent", () => {
    // THE ONE THAT WOULD HAVE HURT. A sticky element with no background still
    // captures clicks across its whole box, so the top ~70px of every scrolled
    // screen — a Drop card, a chat row, the first post in a room — would be
    // visibly there and completely dead, with nothing on screen to explain it.
    expect(headerClasses).toMatch(/data-scrolled:pointer-events-none/);
  });

  it("gives the controls their pointer events back", () => {
    // The other half. Without this the bell, feedback and gear go dead with the
    // bar they sit in, which is worse than the bug above because those are the
    // only way to reach notifications and settings from anywhere in the app.
    expect(layoutClasses).toMatch(/pointer-events-auto/);
  });

  it("takes the wordmark out of the tab order when it leaves", () => {
    // opacity-0 alone leaves a fully transparent link focusable and in the
    // accessibility tree: somebody tabbing lands on nothing, and a screen reader
    // offers a link to a home that is not on screen. pointer-events-none fixes
    // neither — it only stops the mouse.
    expect(layoutClasses).toMatch(/group-data-scrolled:invisible/);
    // And `visibility` has to be in the transition list, or it snaps at the
    // start of the fade instead of waiting for the end of it.
    expect(layoutClasses).toMatch(/transition-\[opacity,transform,visibility\]/);
  });

  it("reads the scroll position passively, and settles before the first paint", () => {
    // This listener runs on every screen in the app. Non-passive would let it
    // block scrolling on the phones it exists for.
    expect(appHeader).toMatch(/\{ passive: true \}/);
    // And it is called once on mount: a back-navigation restores the scroll
    // position before the effect runs, so without it the member returns to a
    // mid-page scroll with the wordmark drawn over their content.
    expect(appHeader).toMatch(/onScroll\(\);\n\s*window\.addEventListener/);
  });

  it("does not fire on the iOS rubber-band", () => {
    // A threshold of zero flickers the wordmark on a bounce that never left the
    // top of the page — which only happens in WKWebView and the TWA, not in a
    // desktop browser, so it is exactly the class of thing the two-engines rule
    // exists for.
    expect(appHeader).toMatch(/window\.scrollY > 24/);
  });

  it("keeps the status-bar clearance that predates it", () => {
    // The header moved into its own component and this calc had to move with
    // it. Without it the wordmark is drawn underneath the clock in the iOS
    // shell, where the web view IS the root view — measured at 59pt of inset
    // against ink starting at 24pt.
    expect(headerClasses).toMatch(/pt-\[calc\(1rem\+env\(safe-area-inset-top\)\)\]/);
    // And nothing left a second copy behind in the layout.
    expect(layoutClasses).not.toMatch(/pt-\[calc\(1rem\+env\(safe-area-inset-top\)\)\]/);
  });
});
