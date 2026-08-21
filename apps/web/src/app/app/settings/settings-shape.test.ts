import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** Assertions read code, not the prose around it. */
const withoutComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

const page = withoutComments(read("./page.tsx"));
const forms = withoutComments(read("./settings-forms.tsx"));
const layout = withoutComments(read("./layout.tsx"));
const tabs = read("./settings-tabs.tsx");
const premium = withoutComments(read("./premium/page.tsx"));
const premiumActions = read("./premium/actions.ts");
const copy = read("../../../../../../packages/config/src/draft-copy.ts");

/**
 * Premium was a page of its own, reached by a card in Settings whose whole
 * content was a heading, a sentence and a link to it — a section pretending to
 * be a section, one navigation away from being one.
 */
describe("premium is a section of settings, not a page beside it", () => {
  it("lives under the settings segment", () => {
    expect(existsSync(here("./premium/page.tsx"))).toBe(true);
    expect(existsSync(here("../premium/page.tsx"))).toBe(false);
  });

  it("is a tab, and General is the other one", () => {
    expect(tabs).toMatch(/href: "\/app\/settings", label: C\.settingsGeneral/);
    expect(tabs).toMatch(/href: "\/app\/settings\/premium", label: C\.premiumHeading/);
  });

  /** The card's three strings went with the card. */
  it("leaves no copy behind for the card that pointed at it", () => {
    for (const key of ["premiumSettingsHeading", "premiumSettingsBody", "premiumSettingsLink"]) {
      expect(copy, key).not.toMatch(new RegExp(`${key}:`));
    }
    expect(page).not.toMatch(/href="\/app\/premium"/);
  });

  /**
   * Stripe sends the member back to a URL this app chose. Moving the route
   * without moving those three is a checkout that completes and lands on a 404.
   */
  it("sends Stripe to where the page now is", () => {
    expect(premiumActions).not.toMatch(/\$\{NEXT_PUBLIC_APP_URL\}\/app\/premium/);
    expect(premiumActions.match(/\/app\/settings\/premium/g) ?? []).toHaveLength(3);
  });

  /**
   * The bar is chrome the layout renders, so it sits outside #main — and the
   * skip link lands on #main. An h1 up there is an h1 the skip link jumps past.
   */
  it("keeps each page's heading inside the landmark the skip link targets", () => {
    expect(layout).not.toMatch(/<h1/);
    // withoutComments leaves the JSX comment's empty braces behind, so this
    // allows for them rather than for arbitrary content.
    expect(page).toMatch(/<main id="main">[\s{}]{0,30}<h1/);
    expect(premium).toMatch(/<main id="main">[\s{}]{0,30}<h1/);
  });

  /** One bar, not two answers to one question. */
  it("is the same bar as the rooms", () => {
    const rooms = read("../rooms/room-tabs.tsx");
    for (const shape of ["scroll-shadows-x flex snap-x gap-1", "border-b border-line px-6"]) {
      expect(tabs, shape).toContain(shape);
      expect(rooms, shape).toContain(shape);
    }
    expect(tabs).toMatch(/aria-current=\{current \? "page" : undefined\}/);
  });
});

/**
 * Signing out was a bordered panel with a title and a sentence explaining what
 * signing out is — the most ordinary control in the app, given the same weight
 * as the block list.
 */
describe("signing out is a button, not a topic", () => {
  it("has no card, no heading and no explanation", () => {
    expect(page).not.toMatch(/signOutHeading|signOutBody/);
    expect(copy).not.toMatch(/signOutHeading:|signOutBody:/);
    expect(page).toMatch(/DRAFT_COPY\.app\.signOutLabel/);
  });

  /**
   * At the bottom, above deletion. They are next to each other only in the
   * sense that both end a session, and one of them ends rather more than that.
   */
  it("sits at the bottom, before the account deletion", () => {
    const out = page.indexOf("signOutLabel");
    const gone = page.indexOf("<DeleteAccount");
    expect(out).toBeGreaterThan(page.indexOf("blockedHeading"));
    expect(out).toBeLessThan(gone);
  });
});

/**
 * A text box sitting open at the bottom of Settings is a text box a member
 * scrolls past on their way to somewhere else, with the most irreversible
 * action in the product already half set up.
 */
describe("deleting asks in a dialog", () => {
  it("puts the confirmation behind the one modal", () => {
    expect(forms).toMatch(/<Modal/);
    expect(forms).toMatch(/trigger=\{C\.deleteButton\}/);
    const panel = forms.slice(forms.indexOf("<Modal"));
    expect(panel).toMatch(/name="confirm"/);
  });

  /** §9.3 verbatim, and it has to be readable at the moment of confirming. */
  it("repeats the warning inside, where the page behind it is inert", () => {
    const panel = forms.slice(forms.indexOf("<Modal"));
    expect(panel).toMatch(/COPY\.deletion\.confirmation/);
  });

  /** Landing the cursor in it is the dialog finishing the setup for them. */
  it("does not focus the field that deletes the account", () => {
    expect(forms).not.toMatch(/autoFocus/);
  });

  /** Typed, not tapped — §3.4 says "we mean actually deleted". */
  it("still asks for the word", () => {
    expect(forms).toMatch(/C\.deleteConfirmLabel/);
    expect(forms).toMatch(/id="confirm"/);
  });
});
