import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DRAFT_COPY } from "@plusone/config";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const card = read("./drop-card.tsx");
const page = read("./page.tsx");
const lib = read("../../lib/drop.ts")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

/**
 * Decision #19 and §6.1 step 5 both name a compatibility percentage. It was
 * computed by selectDrop and thrown away one layer later: DropCard and
 * PreviewCard had no field for it, and loadCards re-read the served ids from
 * visible_profiles without it.
 */
describe("the compatibility percentage reaches the card", () => {
  it("is on both card shapes", () => {
    expect(lib).toMatch(/readonly compatibility: number \| null;/);
    expect((lib.match(/readonly compatibility: number \| null;/g) ?? []).length).toBe(2);
  });

  it("is rendered on the full card and on the preview", () => {
    expect((card.match(/card\.compatibility != null/g) ?? []).length).toBe(2);
    expect(card).toMatch(/DRAFT_COPY\.app\.compatibilityLabel/);
  });

  /**
   * The ranking score is the wrong number to show: it mixes in recency and
   * underexposure, so a card would read as more compatible partly because that
   * person had not been served lately.
   */
  it("is not taken from the ranking score", () => {
    expect(lib).toMatch(/dropLogic\.compatibility\(/);
    const helper = lib.slice(lib.indexOf("async function compatibilityFor"));
    expect(helper).not.toMatch(/recencyActive|underexposure|\.parts/);
  });

  /**
   * Both paths use the same helper. A member who reopens the app must not see a
   * different number from the one they saw at eight.
   */
  it("is computed the same way whether the Drop is fresh or stored", () => {
    expect((lib.match(/await compatibilityFor\(/g) ?? []).length).toBe(2);
  });

  /** quiz_responses is own-rows-only and has to stay that way. */
  it("reads trait vectors with the service client, never the member's", () => {
    const helper = lib.slice(lib.indexOf("async function compatibilityFor"));
    expect(helper).toMatch(/serviceClient\(\)[\s\S]{0,120}quiz_responses/);
  });

  /** A skipped quiz must not read as absent rather than as zeroes. */
  it("keeps a skipped quiz distinct from a zero vector", () => {
    const helper = lib.slice(lib.indexOf("async function compatibilityFor"));
    expect(helper).toMatch(/trait_vector\?\.length \? row\.trait_vector : null/);
  });

  it("says what the number measured rather than presenting it as a verdict", () => {
    expect(DRAFT_COPY.app.compatibilityLabel(82)).toBe("82% match");
    expect(DRAFT_COPY.app.compatibilityNote).toMatch(/looking for/i);
  });
});

/**
 * The card carried a name, an age, a distance and a badge — four measurements
 * of a person and not one word from them. Decision #14 makes a connect a reply
 * to a prompt, so the prompt is also what the next screen asks about.
 */
describe("the card carries something the person said", () => {
  it("selects and renders one answered prompt", () => {
    expect(lib).toMatch(/photo_privacy, prompts/);
    expect(lib).toMatch(/function firstPrompt/);
    expect(card).toMatch(/card\.prompt \?/);
    expect(card).toMatch(/<blockquote/);
  });

  /** jsonb, so an unknown id or an empty answer must not render as a blank quote. */
  it("skips a prompt it cannot render honestly", () => {
    const fn = lib.slice(lib.indexOf("function firstPrompt"));
    expect(fn).toMatch(/answer\.trim\(\) === ""/);
    expect(fn).toMatch(/promptQuestion\(id\)/);
  });
});

/**
 * Decision #19 puts density stats and mechanics explainers on the Preview
 * screen. Neither existed, so a support-only member saw three redacted cards
 * and an invitation to give up a shield, with nothing to weigh it against.
 */
describe("the preview screen explains itself", () => {
  it("says how many people were in the pool", () => {
    expect(page).toMatch(/DRAFT_COPY\.app\.previewDensity\(drop\.poolSize, drop\.radiusUsedMi\)/);
    expect(DRAFT_COPY.app.previewDensity(11, 50)).toMatch(/11 people within 50 miles/);
    expect(DRAFT_COPY.app.previewDensity(1, 50)).toMatch(/^1 person/);
  });

  it("explains the mechanics it is asking them to join", () => {
    expect(page).toMatch(/previewHowHeading/);
    expect(DRAFT_COPY.app.previewHow.length).toBeGreaterThanOrEqual(3);
  });

  /** The stat is about tonight, not about when the row was written. */
  it("counts the pool live rather than storing it with the Drop", () => {
    const stored = lib.slice(lib.indexOf("if (existing)"), lib.indexOf("const { data: rows }"));
    expect(stored).toMatch(/drop_candidates/);
  });
});
