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
describe("an icon-only bar still names its destinations", () => {
  it("gives every link the label as its accessible name", () => {
    // Without this the bar is five unnamed links, which is strictly worse than
    // the words it replaced: a screen reader had a perfectly good nav before.
    expect(links).toMatch(/aria-label=\{item\.label\}/);
  });

  it("hides the marks from the accessibility tree", () => {
    // Or the name is read twice — once from aria-label and once from the svg.
    expect(icons).toMatch(/"aria-hidden": true/);
  });

  it("keeps a word for any route without a mark", () => {
    // A sixth section added to NAV renders something legible rather than an
    // empty tab, which is the failure that would ship silently. `!Icon` is the
    // half that does it; `showLabel` is the deliberate one below.
    expect(links).toMatch(/item\.showLabel \|\| !Icon/);
  });

  it("keeps the word on Tonight, and only there", () => {
    // The one tab whose label was doing real work: no mark says "three people,
    // once a day", so a crescent alone has to be learned by tapping it. The
    // other four are conventions read cold.
    const layoutSrc = noComments(layout);
    expect(layoutSrc).toMatch(/\{ href: "\/app", label: [^}]*showLabel: true \}/);
    expect((layoutSrc.match(/showLabel: true/g) ?? []).length).toBe(1);
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
