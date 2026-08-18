import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DRAFT_COPY } from "@plusone/config";
import { profile } from "@plusone/logic";

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

/**
 * Reported: "the quiz doesn't save the answers if the user goes back a page,
 * but everything else does."
 *
 * Back is a link everywhere else, which is fine there — one field, and its
 * saved value comes back on a revisit. Here it is twelve questions, and a link
 * never submits, so everything answered since the last Continue was gone the
 * moment a member checked something on the screen before.
 */
describe("the quiz carries its answers backwards", () => {
  const actions = read("quiz/actions.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const form = read("quiz/quiz-form.tsx");

  it("makes Back a submit rather than a link", () => {
    expect(form).toMatch(/name="back"\s+value="1"/);
    expect(form).toMatch(/back=\{/);
  });

  it("still looks like every other Back", () => {
    expect(form).toMatch(/className=\{backButtonClass\}/);
  });

  it("saves before it leaves, and leaves backwards", () => {
    expect(actions).toMatch(/const goingBack = formData\.get\("back"\) === "1"/);
    expect(actions).toMatch(
      /redirect\(goingBack && backTo \? STEP_ROUTES\[backTo\] : nextRoute\("quiz"\)\)/,
    );
  });

  /**
   * Presence of the row is what resolveStep reads as "settled". An empty one
   * written on the way back would mark the quiz done and skip it on the next
   * resume — the step would vanish because the member glanced backwards.
   */
  it("writes no row when nothing has been answered", () => {
    const guard = actions.slice(
      actions.indexOf("const goingBack"),
      actions.indexOf("getServerSupabase()"),
    );
    expect(guard).toMatch(/Object\.keys\(answers\)\.length === 0/);
    expect(guard).toMatch(/redirect\(STEP_ROUTES\[backTo\]\)/);
  });
});

/**
 * Two number boxes made the member do the comparing: nothing said they were the
 * two ends of one thing, and nothing stopped 40 in the first and 25 in the
 * second — which profiles_age_range_is_adult then refused at the bottom of a
 * filled-in form.
 */
describe("the age range is one control with two ends", () => {
  const form = read("preferences/preferences-form.tsx");

  it("is a slider, not a pair of number fields", () => {
    expect(form).toMatch(
      /type="range"[\s\S]{0,400}name="age_min"|name="age_min"[\s\S]{0,400}type="range"/,
    );
    expect(form).not.toMatch(/name="age_min"[\s\S]{0,200}type="number"/);
  });

  it("clamps the two ends so they cannot cross", () => {
    expect(form).toMatch(/setMin\(Math\.min\(Number\(event\.target\.value\), max\)\)/);
    expect(form).toMatch(/setMax\(Math\.max\(Number\(event\.target\.value\), min\)\)/);
  });

  /** "18" on its own says nothing about which end it is. */
  it("tells a screen reader which end each thumb is", () => {
    expect(form).toMatch(/aria-valuetext=\{C\.ageFromValue\(min\)\}/);
    expect(form).toMatch(/aria-valuetext=\{C\.ageToValue\(max\)\}/);
  });

  it("takes both bounds from the one place that defines them", () => {
    expect(form).toMatch(/profile\.MINIMUM_AGE/);
    expect(form).toMatch(/profile\.OLDEST_PREFERENCE/);
  });

  /**
   * Two range inputs stacked on one track: the second is drawn over the first,
   * and a range input is full-width — so every press landed on the top slider
   * and the "from" thumb could not be grabbed at all. Reported exactly that
   * way: only the "to" end moved.
   */
  it("lets both thumbs be grabbed, not just the top slider", () => {
    expect(form).toMatch(/className="range-overlay/);
    const css = readFileSync(
      fileURLToPath(new URL("../../styles/globals.css", import.meta.url)),
      "utf8",
    );
    // The input takes no pointer events; only its thumb does.
    expect(css).toMatch(/\.range-overlay \{[^}]*pointer-events: none/);
    expect(css).toMatch(/::-webkit-slider-thumb \{[^}]*pointer-events: auto/);
    expect(css).toMatch(/::-moz-range-thumb \{[^}]*pointer-events: auto/);
  });

  /** Stacked thumbs: the buried one has to come up or it cannot be moved. */
  it("raises the lower thumb once it reaches the upper half", () => {
    expect(form).toMatch(/zIndex: min > \(AGE_FLOOR \+ AGE_CEILING\) \/ 2/);
  });

  /**
   * The cap is the PREFERENCE ceiling, not the column's. MAXIMUM_AGE still
   * mirrors profiles_age_range_is_adult; this is what the slider offers.
   */
  it("caps the range at eighty without touching the database bound", () => {
    expect(profile.OLDEST_PREFERENCE).toBe(80);
    expect(profile.MAXIMUM_AGE).toBe(120);
    expect(profile.OLDEST_PREFERENCE).toBeLessThan(profile.MAXIMUM_AGE);
  });

  /** A row saved under the old ceiling would put a thumb off its own track. */
  it("clamps a saved value that predates the cap", () => {
    expect(form).toMatch(/const clamp = \(age: number\) =>/);
    expect(form).toMatch(/useState\(clamp\(from \?\? AGE_FLOOR\)\)/);
    expect(form).toMatch(/useState\(clamp\(to \?\? AGE_CEILING\)\)/);
  });
});
