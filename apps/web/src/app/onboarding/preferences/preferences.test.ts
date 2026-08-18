import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DRAFT_COPY, GENDER_LABELS, KIDS_LABELS, KIDS_PLAN_LABELS } from "@plusone/config";

const read = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");
const actions = read("./actions.ts")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");
/** The rules themselves live here, shared with the profile editor. */
const parser = read("../../../lib/preferences.ts")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");
const form = read("./preferences-form.tsx");
const page = read("./page.tsx");

/**
 * The whole reason this step exists. `gender` and `seeking` were columns
 * nothing read or wrote, so drop_candidates filtered on distance alone and
 * every member was shown to every member inside their radius.
 */
describe("the two answers that decide the Drop", () => {
  it("refuses to save without a gender", () => {
    expect(parser).toMatch(/if \(!gender\) return \{ error: E\.genderRequired \}/);
  });

  /**
   * An empty `seeking` means EVERYONE, which is what the mutual filter reads it
   * as. Requiring a choice here would be a different product decision made by
   * accident, and defaulting it to something would be a preference the member
   * never expressed.
   */
  it("accepts choosing nobody as meaning everybody", () => {
    expect(form).toMatch(/type="checkbox"[\s\S]{0,120}name="seeking"/);
    expect(parser).not.toMatch(/seeking\.length === 0[\s\S]{0,60}return \{ error/);
  });

  it("never writes a value the enum does not hold", () => {
    // Everything goes through oneOf or an explicit membership filter, so a
    // hand-posted body cannot reach the column.
    expect(parser).toMatch(/function oneOf/);
    expect(parser).toMatch(/raw in allowed/);
    expect(parser).toMatch(/\.filter\(\(value\) => value in GENDER_LABELS\)/);
  });

  it("does not let the same choice be counted twice", () => {
    expect(parser).toMatch(/\[\.\.\.new Set\(seeking\)\]/);
  });
});

describe("the age range", () => {
  /** Blank is "no preference", and no preference is not zero. */
  it("treats an empty box as unstated rather than as a number", () => {
    expect(parser).toMatch(/if \(raw === ""\) return null/);
  });

  it("refuses a range below eighteen or above the ceiling", () => {
    expect(parser).toMatch(/age < AGE_FLOOR \|\| age > AGE_CEILING/);
    // The bounds are shared with the slider now, so this asserts they come from
    // the one definition rather than a literal repeated per module.
    expect(parser).toMatch(/AGE_FLOOR = profile\.MINIMUM_AGE/);
    expect(parser).toMatch(/AGE_CEILING = profile\.OLDEST_PREFERENCE/);
  });

  /**
   * profiles_age_range_is_adult refuses a swapped pair too. Caught here so it
   * reaches the member as a sentence about the two boxes rather than as a save
   * that silently failed.
   */
  it("catches a swapped pair before the constraint does", () => {
    expect(parser).toMatch(/ageMin > ageMax/);
    expect(parser).toMatch(/E\.ageOrder/);
  });
});

describe("what the step promises about itself", () => {
  /**
   * Smoking, drinking and kids are answers ABOUT the member, not filters on
   * anybody else — Decision #11 already warns the local pool thins, and
   * filtering a single-city pool again on smoking would empty it. The screen
   * says so, because a member who reads them as filters answers strategically
   * instead of honestly.
   */
  it("tells the member the lifestyle answers do not filter anything", () => {
    // The claim, not a phrasing: it has to say these do not narrow the Drop.
    expect(DRAFT_COPY.preferences.aboutHint).toMatch(/filter/i);
    expect(DRAFT_COPY.preferences.aboutHint).toMatch(/drop/i);
  });

  it("offers a way to answer none of them", () => {
    expect(DRAFT_COPY.preferences.skipLabel).toBeTruthy();
    expect(form).toMatch(/optional \? \(/);
  });

  /**
   * Walking back into a step must show what was answered. Without this the form
   * renders empty and submitting it overwrites real answers with nulls — which
   * is a new failure the Back button introduced the moment it shipped.
   */
  it("reads existing answers back so Back does not blank them", () => {
    expect(page).toMatch(/my_profile/);
    expect(form).toMatch(/defaultChecked=\{selected === value\}/);
    expect(form).toMatch(/defaultChecked=\{defaults\.seeking\.includes\(value\)\}/);
    // The age range is a two-thumb slider now; its ends seed the state.
    expect(form).toMatch(/useState\(clamp\(from \?\? AGE_FLOOR\)\)/);
    expect(form).toMatch(/useState\(clamp\(to \?\? AGE_CEILING\)\)/);
    expect(form).toMatch(/<AgeRange from=\{defaults\.ageMin\} to=\{defaults\.ageMax\} \/>/);
  });

  /** supabase-js resolves rather than rejects; an unchecked update reads as success. */
  it("checks the write", () => {
    expect(actions).toMatch(
      /if \(error\) return \{ error: DRAFT_COPY\.preferences\.errors\.failed \}/,
    );
  });
});

describe("the option sets", () => {
  it("offers something for a member who is not a woman or a man", () => {
    expect(Object.keys(GENDER_LABELS)).toContain("non_binary");
    expect(Object.keys(GENDER_LABELS)).toContain("other");
  });

  it("names things without naming a condition", () => {
    const everything = [
      ...Object.values(GENDER_LABELS),
      ...Object.values(KIDS_LABELS),
      ...Object.values(KIDS_PLAN_LABELS),
      ...Object.values(DRAFT_COPY.preferences.errors),
      DRAFT_COPY.preferences.heading,
      DRAFT_COPY.preferences.intro,
    ].join(" ");
    expect(everything).not.toMatch(/\b(hsv|hiv|herpes|positive|diagnos)/i);
  });
});
