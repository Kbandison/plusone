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
/**
 * Source with its comments removed — and only its comments.
 *
 * The naive version treated any `/*` as a comment opener, including the one
 * inside `accept="image/*"`. It then ate everything to the next real `*​/`,
 * which glued one element to another and reported a font size belonging to
 * neither. A gate that accuses a file that is fine is a gate somebody switches
 * off.
 *
 * Requiring a boundary before the opener is not a parser, but it is the
 * difference between a comment and a MIME type, and it errs toward stripping
 * LESS — which can only ever surface more candidates, never hide one.
 */
const read = (f: string) =>
  readFileSync(f, "utf8")
    .replace(/(^|[\s{(,;])\/\*[\s\S]*?\*\//g, "$1")
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

  /**
   * Keyed on the mark's SHAPE, not on the class it happens to use.
   *
   * This looked for `align-super` until 2026-08-28, when the wordmark stopped
   * using it — at which point the guard would have kept passing while guarding
   * nothing, because no file contains the string any more. A guard that goes
   * quiet when the thing it watches changes is worse than no guard: it reports
   * success for a check it is no longer performing.
   *
   * So it matches the plus-then-One construction itself, which is what a
   * hand-drawn copy would have to reproduce whatever classes it chose.
   */
  const HAND_DRAWN_WORDMARK = />\+<\/span>\s*One/;

  it("no file draws the wordmark by hand", () => {
    const offenders = files
      .filter((f) => !f.endsWith("ui.tsx"))
      .filter((f) => HAND_DRAWN_WORDMARK.test(read(f)));
    expect(offenders.map((f) => f.replace(APP, "app"))).toEqual([]);
  });

  it("...and that guard still recognises the real one", () => {
    // The half the previous version was missing. If this fails, the pattern
    // above has drifted off the wordmark and the check above is vacuous —
    // exactly the state it sat in the moment the classes changed.
    const ui = files.find((f) => f.endsWith("ui.tsx"));
    expect(ui, "ui.tsx is not in the scanned set").toBeDefined();
    expect(HAND_DRAWN_WORDMARK.test(read(ui as string))).toBe(true);
  });
});

describe("controls meet the accessibility floors", () => {
  /**
   * iOS Safari zooms the viewport when a focused control's font-size is under
   * 16px, and the app sets no maximum-scale (nor should it). Fourteen fields
   * were at 15px, so focusing them jumped the page.
   */
  let checked = 0;

  it("no focusable field is under 16px", () => {
    const offenders: string[] = [];
    for (const f of files) {
      // `=>` is not the end of a tag.
      //
      // This scans to the first `>` after the tag name, and an inline handler —
      // onChange={(event) => …} — puts one inside the attributes. The match then
      // ran past the real tag end and swallowed the next element, so a
      // sibling's font size was read as this control's: a file that was fine,
      // reported as an offender, which is the failure mode that gets a gate
      // switched off rather than fixed.
      //
      // Blanking the arrows first rather than making the pattern clever about
      // them. Alternating `=>` against `[^>]` does not work — the class eats the
      // `=` before the alternative is ever tried.
      const source = read(f).replaceAll("=>", "==");

      // Class strings extracted to a const are part of the tag too.
      //
      // The scan reads a literal `text-[Npx]` from between the angle brackets,
      // so `className={FIELD}` is invisible to it — no match, no offender, no
      // coverage, silently. `browse-filters.tsx` hoisted its field classes to a
      // constant when it grew to nineteen controls and took six selects out of
      // this gate's sight by doing it, which is the wrong direction for a
      // refactor to move a safety check.
      //
      // Only same-file, single-line string consts, which is what this pattern
      // is in practice. A className built at runtime still slips through, and
      // that is worth knowing rather than pretending otherwise: this gate reads
      // source, and the only complete check is measuring a rendered control.
      const consts = new Map<string, string>();
      for (const match of source.matchAll(/const (\w+)\s*=\s*"([^"]*)"/g)) {
        consts.set(match[1] as string, match[2] as string);
      }

      for (const match of source.matchAll(/<(input|textarea|select)\b[\s\S]{0,700}?\/?>/g)) {
        const tag = (match[0] as string).replace(
          /className=\{(\w+)\}/g,
          (whole, name: string) => consts.get(name) ?? whole,
        );
        const size = /text-\[(\d+(?:\.\d+)?)px\]/.exec(tag);
        if (size && Number(size[1]) < 16) offenders.push(f.replace(APP, "app"));
        if (size) checked += 1;
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * That the scan above SEES anything.
   *
   * Every assertion it makes is of the form "no match was bad", so a pattern
   * that matched nothing at all would pass it forever — and the const-resolution
   * fix exists precisely because a refactor had already quietly cut its reach.
   * A floor on the number of controls it actually read turns that from silent
   * into loud.
   */
  it("actually reads a meaningful number of fields", () => {
    expect(checked).toBeGreaterThan(20);
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

describe("a dialog keeps the browser's own hiding", () => {
  /**
   * `dialog:not([open]) { display: none }` is a UA rule, and any display
   * utility on the element beats it. A closed dialog carrying `flex` stays in
   * the layout — and a fixed, full-viewport one is then an invisible sheet over
   * the page that catches every click. That is what stopped the room tab bar
   * and the composer responding in any room holding a photograph.
   *
   * The fix is always the same: put the display value on a wrapper inside,
   * where it is only ever a display value.
   */
  const DISPLAY = [
    "flex",
    "grid",
    "block",
    "inline-block",
    "inline-flex",
    "inline-grid",
    "table",
    "contents",
  ];

  it("carries no display utility on the element itself", () => {
    const offenders: string[] = [];
    for (const f of files) {
      // Arrows blanked first: an inline handler puts a `>` inside the
      // attributes, and the scan would stop at it and never see the className.
      // The same trap the 16px scan above hits.
      const source = read(f).replaceAll("=>", "==");
      for (const match of source.matchAll(/<dialog\b[\s\S]{0,900}?>/g)) {
        const classes = /className=(?:"([^"]*)"|\{`([^`]*)`\})/.exec(match[0]);
        const tokens = (classes?.[1] ?? classes?.[2] ?? "").split(/\s+/);
        if (tokens.some((t) => DISPLAY.includes(t.replace(/^[a-z-]+:/, "")))) {
          offenders.push(f.replace(APP, "app"));
        }
      }
    }
    expect(offenders).toEqual([]);
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
