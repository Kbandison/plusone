import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const icons = read("./nav-icons.tsx");
/**
 * Comments stripped, and this one is not theoretical.
 *
 * The first version of the tap-target assertion below matched `min-h-tap` in a
 * COMMENT I had written next to the class explaining why it was there — so
 * deleting the class itself still passed. A test satisfied by prose about the
 * code is the exact thing this repo strips for in its migration scans, arriving
 * one language over.
 */
const noComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

const links = noComments(read("./nav-links.tsx"));
const layout = read("./layout.tsx");

/**
 * The bottom bar, once the words came off it.
 *
 * Every assertion here is about something the LABEL used to do for free.
 * Dropping it is cheap to write and takes three things with it — the accessible
 * name, the height, and the ability to tell two tabs apart — so each is pinned
 * rather than assumed.
 */
describe("every tab is a mark and its word", () => {
  it("gives every link the label as its accessible name", () => {
    // Without this the bar is five unnamed links, which is strictly worse than
    // the words it replaced: a screen reader had a perfectly good nav before.
    expect(links).toMatch(/aria-label=\{item\.label\}/);
  });

  it("hides the marks from the accessibility tree", () => {
    // Or the name is read twice — once from aria-label and once from the svg.
    expect(icons).toMatch(/"aria-hidden": true/);
  });

  it("draws the word on every tab, unconditionally", () => {
    // Icon-only was tried and reverted. None of the five says what it means to
    // somebody who has not learnt it — Tonight least of all, since no mark says
    // "three people, once a day" — so the word is what makes the drawing
    // learnable. No condition, because a conditional label is how one tab ends
    // up unnamed after a refactor nobody looked at.
    // Structure, not presence. Asserting the <span> merely EXISTS passed
    // against `{Icon ? null : <span …>}` — markup survives inside a
    // conditional, so a substring match cannot tell "always" from "sometimes".
    // This takes the Link's children, removes the one expression that is
    // allowed to branch, and requires nothing conditional to remain.
    // From the icon expression to the close, which is exactly where a
    // conditional label would live. A wider window catches the `?` in the
    // className's own ternary and fails against correct code.
    const children = noComments(links.slice(links.indexOf("{Icon ?"), links.indexOf("</Link>")));
    expect(children).toContain("{item.label}");
    expect(children.replace("{Icon ? <Icon /> : null}", "")).not.toMatch(/\?|&&/);
    expect(links).not.toMatch(/showLabel/);
    expect(noComments(layout)).not.toMatch(/showLabel/);
  });

  it("renders something legible for a route with no mark", () => {
    // A sixth section added to NAV gets a word rather than an empty tab. The
    // label being unconditional is what guarantees it now — the icon is the
    // optional half.
    expect(links).toMatch(/\{Icon \? <Icon \/> : null\}/);
  });
});

describe("the marks are drawn to the grammar the app already had", () => {
  it("takes its colour from the link, so the active state works", () => {
    // The active state is a colour change on the anchor. A baked fill or stroke
    // would ignore it and every tab would look current.
    expect(icons).toMatch(/stroke: "currentColor"/);
    expect(icons).toMatch(/fill: "none"/);
    expect(icons).not.toMatch(/fill="#/);
  });

  it("matches the chat icons' box and weight", () => {
    // chat-icons.tsx set this: 24 box, 1.6 stroke. Two hands drawing two
    // grammars in one app is the thing this stops.
    expect(icons).toMatch(/viewBox: "0 0 24 24"/);
    expect(icons).toMatch(/strokeWidth: 1\.6/);
  });

  it("draws all five, and one for every route in the bar", () => {
    // The floor. A map missing an entry falls back to the word, which is safe
    // and silent — so nothing else here would notice.
    for (const href of ["/app", "/app/browse", "/app/inbox", "/app/rooms", "/app/profile"]) {
      expect(icons, `${href} has no mark`).toMatch(new RegExp(`"${href}":`));
    }
    const navHrefs = [...layout.matchAll(/\{ href: "(\/app[^"]*)"/g)].map((m) => m[1]);
    expect(navHrefs.length).toBe(5);
    for (const href of navHrefs) expect(icons).toMatch(new RegExp(`"${href}":`));
  });
});

describe("the bar keeps its tap target without the label", () => {
  it("holds min-h-tap on the link itself", () => {
    // The label carried the height. At 22px the icon alone is half the 44px
    // minimum, so this is now the only thing keeping the row tappable.
    // In the className, not in prose about it.
    expect(links).toMatch(/className=\{`[^`]*min-h-tap/);
    expect(noComments(icons)).toMatch(/size-\[22px\]/);
  });
});

describe("the tabs are spread, not clustered", () => {
  it("gives every tab an equal share of the bar", () => {
    // Five words fill a phone on their own; five 22px icons do not. Without
    // flex-1 they collect in the middle with a few pixels between them, which
    // is what justify-center left behind when the labels came off.
    expect(links).toMatch(/<li key=\{item\.href\} className="flex-1">/);
  });

  it("does not let the bar wrap to a second row", () => {
    // flex-wrap with flex-1 children is a way to get an unexpected second row,
    // and five icons can never need one.
    expect(noComments(read("./layout.tsx"))).not.toMatch(/<ul className="[^"]*flex-wrap/);
  });
});

describe("the current tab is the accent, not a rule under it", () => {
  it("colours the mark and the word", () => {
    // Kevin's call. The underline put the only marker BELOW the thing it marked,
    // two pixels from the bar's own top border. Colouring the tab says the same
    // thing on the element a thumb is aiming at.
    expect(links).toMatch(/current \? "text-accent"/);
  });

  it("has no underline left to compete with it", () => {
    // border-b-2 stayed behind once as `border-transparent`, which reserves the
    // space and reads as a bar that never lights up.
    expect(links).not.toMatch(/border-b-2/);
    expect(links).not.toMatch(/border-accent/);
  });

  it("still says which tab it is to a screen reader", () => {
    // Colour alone is not a state. aria-current is what carries it where the
    // accent cannot be seen.
    expect(links).toMatch(/aria-current=\{current \? "page" : undefined\}/);
  });
});
