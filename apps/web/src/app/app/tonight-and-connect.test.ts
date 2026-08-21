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

const tonight = withoutComments(read("./page.tsx"));
const card = withoutComments(read("./drop-card.tsx"));
const layout = withoutComments(read("./layout.tsx"));
const panel = withoutComments(read("./connect/[id]/connect-panel.tsx"));
const connectPage = withoutComments(read("./connect/[id]/page.tsx"));

/**
 * Replying to a prompt is a thing you do ABOUT a card, not instead of it.
 * Leaving the grid to write two sentences and coming back to the top of it was
 * the whole reason this became a sheet.
 */
describe("connecting happens over the screen you were on", () => {
  it("intercepts the route from anywhere under /app", () => {
    expect(existsSync(here("./@modal/(.)connect/[id]/page.tsx"))).toBe(true);
    const modal = read("./@modal/(.)connect/[id]/page.tsx");
    expect(modal).toMatch(/<RouteModal>/);
    expect(modal).toMatch(/<ConnectPanel/);
  });

  /**
   * A slot with no default renders a 404 when it cannot match the URL — so
   * without this, every hard load of every screen under /app would fail.
   */
  it("renders nothing the rest of the time", () => {
    expect(existsSync(here("./@modal/default.tsx"))).toBe(true);
    expect(read("./@modal/default.tsx")).toMatch(/return null/);
    expect(layout).toMatch(/modal,/);
    expect(layout).toMatch(/\{modal\}/);
  });

  /**
   * Two copies of a screen that decides who can reach whom is two places for
   * that rule to drift.
   */
  it("is one panel, rendered twice", () => {
    expect(connectPage).toMatch(/<ConnectPanel id=\{id\} source=\{source\} room=\{room\} \/>/);
    expect(panel).toMatch(/from\("visible_profiles"\)/);
    expect(panel).toMatch(/if \(!target\) notFound\(\)/);
    // The wall lives in the panel, so neither entrance can skip it.
    expect(connectPage).not.toMatch(/visible_profiles/);
  });

  /** A hard load still gets the full page, and the URL stays real either way. */
  it("keeps the page for a shared link or a refresh", () => {
    expect(connectPage).toMatch(/<main id="main">/);
    expect(connectPage).toMatch(/export const metadata/);
  });
});

/**
 * A drop excludes anyone you have connected with, but a REPLAYED drop reads
 * back the ids it served earlier — so reopening the app after accepting one of
 * tonight's three showed the same card, with the same Connect button, for
 * somebody you were already talking to.
 */
describe("tonight's cards remember what you did with them", () => {
  it("labels a card from the connect behind it", () => {
    expect(tonight).toMatch(/connectsLogic\.historyWith\(/);
    expect(tonight).toMatch(/history=\{history\.get\(card\.id\)\}/);
    expect(card).toMatch(/\{history\.label\}/);
  });

  /** The same four words Browse uses, not a second set meaning the same. */
  it("reuses Browse's labels", () => {
    for (const key of ["threadNeedsDecision", "threadSentWaiting", "browseTalking", "browsePast"]) {
      expect(tonight, key).toMatch(new RegExp(`DRAFT_COPY\\.app\\.${key}`));
    }
  });

  /**
   * The trigger refuses a second live connect, so offering one is a door onto a
   * wall. A finished connect is different — §6.3 lets those be tried again.
   */
  it("hides the button only while a connect is live", () => {
    expect(card).toMatch(/\{history\?\.live \? null : \(/);
    expect(tonight).toMatch(/live: state !== "past"/);
  });

  /** A live connect outranks a finished one when there are several. */
  it("prefers the current state over an old one", () => {
    expect(tonight).toMatch(/if \(state !== "past" \|\| !history\.has\(them\)\)/);
  });
});

/**
 * "Drop-card connects cost nothing — this nudges toward curation" has been true
 * in the trigger since Milestone 1 and stated nowhere a member could read it. A
 * mechanic that only works if people know about it, that nobody was told about,
 * is a mechanic that does not work.
 */
describe("Decision #15 is said out loud", () => {
  it("says a reply here is free", () => {
    expect(tonight).toMatch(/DRAFT_COPY\.app\.dropConnectsFree/);
  });

  it("says what is left for everywhere else", () => {
    expect(tonight).toMatch(/DRAFT_COPY\.app\.dropBudgetLeft\(left, perDay\)/);
    expect(tonight).toMatch(/DRAFT_COPY\.app\.dropBudgetNone/);
    expect(tonight).toMatch(/isPremium \? CONNECTS\.premiumPerDay : CONNECTS\.freePerDay/);
  });

  /** The trigger writes `day` as the database's current_date; this matches it. */
  it("asks about the same day the budget is written against", () => {
    expect(tonight).toMatch(/\.eq\("day", new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\)/);
  });

  /**
   * A support-only member cannot send a connect at all, so a budget is a number
   * about something they cannot do.
   */
  it("shows none of it on a preview", () => {
    expect(tonight).toMatch(/drop\.preview\s*\n?\s*\?\s*\[\{ data: null \}/);
  });
});
