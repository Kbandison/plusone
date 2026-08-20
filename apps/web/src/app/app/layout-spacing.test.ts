import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const APP = join(import.meta.dirname);
const layout = readFileSync(join(APP, "layout.tsx"), "utf8");
const rooms = readFileSync(join(APP, "rooms/layout.tsx"), "utf8");

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
  it("puts the gap in the layout's content wrapper", () => {
    expect(layout).toMatch(/className="flex-1 pt-6 pb-24 sm:pb-20"/);
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
