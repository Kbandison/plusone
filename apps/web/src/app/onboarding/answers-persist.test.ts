import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DRAFT_COPY } from "@plusone/config";

const here = fileURLToPath(new URL(".", import.meta.url));
const read = (p: string) => readFileSync(join(here, p), "utf8");

/**
 * Every onboarding form rendered blank on a revisit.
 *
 * Harmless while there was no way back. The moment Back existed it turned
 * destructive: the empty form is a real form, so a member who walked back to
 * correct one field and pressed Continue wrote the emptiness over everything
 * else on that screen — and a member who only looked wiped it by leaving.
 */
describe("walking back does not blank what was answered", () => {
  const STEPS: ReadonlyArray<[string, string, RegExp]> = [
    ["basics", "basics/basics-form.tsx", /defaultValue=\{displayName\}/],
    ["basics birthdate", "basics/basics-form.tsx", /defaultValue=\{birthdate\}/],
    ["community", "community/community-form.tsx", /useState<Community \| null>\(chosen\)/],
    ["condition", "community/community-form.tsx", /defaultChecked=\{condition === value\}/],
    ["intention", "intention/intention-form.tsx", /defaultChecked=\{intention === value\}/],
    ["quiz", "quiz/quiz-form.tsx", /useState<Record<string, string>>\(given\)/],
    ["radius", "radius/radius-form.tsx", /useState<number>\(radiusMi \?\? RADIUS\.defaultMi\)/],
    [
      "photo privacy",
      "photos/photos-form.tsx",
      /defaultChecked=\{privacy === "blurred_until_connected"\}/,
    ],
    ["preferences", "preferences/preferences-form.tsx", /defaultChecked=\{selected === value\}/],
  ];

  for (const [name, file, pattern] of STEPS) {
    it(`remembers ${name}`, () => {
      expect(read(file)).toMatch(pattern);
    });
  }

  /**
   * A CONTROLLED input ignores defaultChecked — the state wins on first render.
   * Community, quiz and radius each drive their inputs from state, so their
   * answers have to be seeded into the state itself, not onto the element.
   */
  it("seeds the controlled inputs through state, not through defaults", () => {
    for (const file of [
      "community/community-form.tsx",
      "quiz/quiz-form.tsx",
      "radius/radius-form.tsx",
    ]) {
      const source = read(file);
      expect(source, file).toMatch(/useState[^\n]*\((chosen|given|radiusMi)/);
    }
  });

  /** Every page has to actually pass them, or the defaults are always empty. */
  it("reads them on the server", () => {
    for (const page of [
      "basics/page.tsx",
      "community/page.tsx",
      "intention/page.tsx",
      "radius/page.tsx",
      "photos/page.tsx",
    ]) {
      expect(read(page), page).toMatch(/ownProfile|ownPhotoList/);
    }
    expect(read("quiz/page.tsx")).toMatch(/ownQuizAnswers/);
  });
});

describe("the way out of a step", () => {
  /**
   * "Done" was wrong twice: the quiz is step 8 of 10, so it finishes nothing,
   * and next to a Back button it read as a way out of onboarding rather than
   * through it.
   */
  it("says Continue on the quiz, not Done", () => {
    const quiz = read("quiz/quiz-form.tsx");
    expect(quiz).toMatch(/\{COPY\.actions\.continueLabel\}/);
    expect(quiz).not.toMatch(/finishLabel/);
    // And it uses the approved string rather than a draft that spells it the
    // same, which would be a second place for the word to drift.
    expect(DRAFT_COPY.quiz).not.toHaveProperty("finishLabel");
  });

  /**
   * Back was a small grey underlined link beside a solid Continue — one looked
   * like a decision, the other like a remark. They are a pair.
   */
  it("gives Back the same shape as Continue, one tone lighter", () => {
    const actions = read("step-actions.tsx");
    expect(actions).toMatch(/buttonClass\("secondary"/);
    expect(actions).not.toMatch(/text-\[14\.5px\] text-ink-3/);
  });

  it("puts Back to the left of Continue, in the DOM too", () => {
    const actions = read("step-actions.tsx");
    const row = actions.slice(actions.indexOf("export function StepActions"));
    expect(row.indexOf("<BackLink")).toBeLessThan(row.indexOf("{children}"));
  });
});
