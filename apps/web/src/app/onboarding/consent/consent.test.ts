import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The §9.1 consent screen.
 *
 * Two things it got wrong in one day, both worth a test rather than a memory.
 *
 * The link to the policy was duplicated, because I checked consent-form.tsx for
 * one, found none, and never opened page.tsx — which already had it. Two
 * identical links on a consent screen is not a cosmetic problem: it is two
 * things to read on the screen whose whole job is that one thing gets read.
 *
 * And it opened in the same tab. On any other screen that is fine; here it
 * costs the member their place in a half-filled form, and a member who has to
 * start the step again will not read the policy at all.
 */

const DIR = import.meta.dirname;
const page = readFileSync(join(DIR, "page.tsx"), "utf8");
const form = readFileSync(join(DIR, "consent-form.tsx"), "utf8");

/**
 * Comments stripped, because the first version of this matched the sentence in
 * page.tsx explaining that the paragraph is "not shortened behind a read more".
 * A test that reads the prose about the rule instead of the code implementing
 * it will pass and fail for the wrong reasons.
 */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the health-data consent screen", () => {
  it("links to the policy exactly once", () => {
    const occurrences = (page + form).match(/policyLinkLabel/g) ?? [];
    expect(occurrences, "the policy link is duplicated across the page and the form").toHaveLength(
      1,
    );
  });

  it("opens that link in a new tab", () => {
    expect(page).toMatch(/target="_blank"/);
    expect(page).toMatch(/rel="noreferrer"/);
  });

  it("points at the health-data section rather than the top of the policy", () => {
    // The policy is long. Landing someone at the top of it, at the moment they
    // are being asked to consent, is the same as not linking it.
    expect(page).toMatch(/HEALTH_DATA_ANCHOR/);
  });

  it("keeps the consent paragraph verbatim and unabridged", () => {
    // §9.1: the paragraph IS the consent. Not a summary of one, and not
    // shortened behind a "read more".
    // Rendered whole: `{COPY.consent.healthData}` and nothing applied to it.
    expect(code(page)).toMatch(/\{COPY\.consent\.healthData\}/);
    expect(code(page)).not.toMatch(/COPY\.consent\.healthData[.[]/);
  });

  it("asks for one unbundled tick and nothing else", () => {
    const inputs = form.match(/<input\b/g) ?? [];
    expect(
      inputs.length,
      "the consent screen collects more than the single tick",
    ).toBeLessThanOrEqual(1);
  });
});
