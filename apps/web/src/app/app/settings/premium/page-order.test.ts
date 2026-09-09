import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const noComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

const page = noComments(read("./page.tsx"));

/**
 * The premium screen answers two different questions and used one order for
 * both: a visitor asking what this is, and a subscriber changing a setting.
 * The pitch was FIFTH, under two controls a visitor cannot use.
 */
describe("a visitor is told what it is before being asked to pay", () => {
  it("puts the includes list above the plan chooser", () => {
    const includes = page.indexOf("premiumIncludesHeading");
    const plans = page.indexOf("<PlanChooser");
    expect(includes).toBeGreaterThan(0);
    expect(plans).toBeGreaterThan(0);
    expect(includes).toBeLessThan(plans);
  });

  it("does not render the list twice for one reader", () => {
    // Both branches use PremiumIncludes; each is inside a different arm, so
    // exactly one can render. Two unconditional copies would show a subscriber
    // the pitch twice.
    expect((page.match(/<PremiumIncludes \/>/g) ?? []).length).toBe(2);
    expect(page).toMatch(/\{isPremium \? \([\s\S]*?<PremiumIncludes/);
  });
});

describe("the exit is never behind the paywall", () => {
  it("shows the controls to anybody who still has one switched on", () => {
    // THE RULE THIS SECTION EXISTS TO NOT BREAK. Both toggles are ungated in
    // the OFF direction on purpose — set_incognito and
    // set_read_receipts_hidden refuse only the paid one. Gating the section on
    // isPremium alone would strand a lapsed member incognito, with the control
    // to leave visible only to people who are paying.
    expect(page).toMatch(/\{isPremium \|\| incognito \|\| hideReadReceipts \? \(/);
  });

  it("still passes each toggle the real premium state", () => {
    // The section renders for a lapsed member; the toggles inside must still
    // know they are lapsed, or the ON direction would look available.
    expect(page).toMatch(
      /<IncognitoToggle on=\{incognito\} isPremium=\{Boolean\(isPremium\)\} \/>/,
    );
    expect(page).toMatch(
      /<ReadReceiptsToggle hidden=\{hideReadReceipts\} isPremium=\{Boolean\(isPremium\)\} \/>/,
    );
  });
});

describe("the controls are one section in the tier's own words", () => {
  it("groups both toggles under a single heading", () => {
    // They were two top-level sections and they are the same purchase in two
    // places. One h2, two h3s.
    expect(page).toMatch(/premiumControlsHeading/);
    const section = page.slice(page.indexOf("premiumControlsHeading"));
    const body = section.slice(0, section.indexOf("</section>"));
    expect(body).toMatch(/incognitoHeading/);
    expect(body).toMatch(/readReceiptsHeading/);
    expect(body).not.toMatch(/<h2/);
  });

  it("keeps the free alternative next to the thing it is an alternative to", () => {
    // Support-only mode is the free total version. Naming it beside incognito
    // is what stops somebody buying what they already have.
    const section = page.slice(page.indexOf("premiumControlsHeading"));
    expect(section.slice(0, section.indexOf("</section>"))).toMatch(/incognitoFreeAlternative/);
  });
});
