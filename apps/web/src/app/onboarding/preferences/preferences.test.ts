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

/**
 * Faith and politics have their own consent, and the database holds it.
 *
 * Q3 of the 2026-09-10 counsel brief. Until then the whole mitigation was a
 * hint beside the fields saying they do NOT sit behind the consent screen the
 * health fields sit behind — notice rather than consent, on two categories GDPR
 * Article 9 names in their own right.
 *
 * The gate is a trigger because `authenticated` holds INSERT and UPDATE on both
 * columns: a member can PATCH either straight through PostgREST, so a check in
 * the server action is decoration. Same finding as the per-photo privacy gate.
 */
describe("a belief is not a preference", () => {
  const migration = read(
    "../../../../../../supabase/migrations/20260910000100_a_belief_is_not_a_preference.sql",
  );
  // NOT the comment-stripped `actions` above: these assertions are about the
  // order of two calls, and the stripped copy is fine for that — but the
  // 42501 check reads more clearly against the real file.
  const action = read("./actions.ts");
  const form = read("./preferences-form.tsx");

  it("gates the write in a trigger, not only in the action", () => {
    // Comments stripped. Commenting the CREATE TRIGGER out left the words in
    // the file and this passed — a function with no trigger on it gates
    // nothing, and the assertion could not tell the difference.
    const sql = migration.replace(/^\s*--.*$/gm, "");
    expect(sql).toMatch(/create trigger profiles_beliefs_consent/);
    expect(sql).toMatch(/before insert or update of religion, politics on public\.profiles/);
    expect(sql).toMatch(/execute function public\.profiles_beliefs_need_consent\(\)/);
  });

  it("never gates clearing, so consent can be withdrawn", () => {
    // A consent that cannot be walked back is not one. Proven against the live
    // database inside a rolled-back transaction: clearing both was ALLOWED with
    // no consent row present.
    const fn = migration.slice(migration.indexOf("v_disclosing :="));
    expect(fn).toMatch(/new\.religion is not null/);
    expect(fn).toMatch(/new\.politics is not null/);
  });

  it("never gates prefer_not_to_say", () => {
    // A real stored answer that discloses no belief. Requiring consent to record
    // that somebody declined would make the refusal cost more than the
    // disclosure. Also proven live: ALLOWED with no consent row.
    expect(migration.match(/'prefer_not_to_say'/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("compares the kind as text, so the migration can apply at all", () => {
    // `beliefs` is added by this same file and Postgres refuses to USE a value
    // added in the current transaction — an enum literal here would fail on the
    // very apply that creates it. This is not a style choice.
    expect(migration).toMatch(/c\.kind::text = 'beliefs'/);
    expect(migration).not.toMatch(/kind = 'beliefs'::/);
  });

  it("records the consent before the write it authorises", () => {
    // The other order has the trigger reject the update and the tick never
    // stored.
    //
    // The condition is asserted, not just the position. Replacing it with
    // `if (false)` left the insert exactly where it was and this passed on an
    // unreachable branch — an order check says nothing about whether the code
    // between the two indexes can run.
    const gate = action.indexOf('formData.get("beliefsConsent") === "on"');
    const consent = action.indexOf('"consents"');
    const update = action.indexOf('from("profiles").update');
    expect(gate).toBeGreaterThan(-1);
    expect(consent).toBeGreaterThan(gate);
    expect(update).toBeGreaterThan(consent);
    expect(action).toMatch(/copy_version: CONSENT_COPY_VERSION\.beliefs/);
  });

  it("does not pre-tick the box", () => {
    // A pre-checked box is not consent, and this is the one control on the form
    // where that distinction is the entire point.
    const box = form.slice(
      form.indexOf('name="beliefsConsent"') - 200,
      form.indexOf('name="beliefsConsent"') + 200,
    );
    expect(box).not.toMatch(/defaultChecked|checked=\{/);
  });

  it("turns the refusal into a sentence", () => {
    expect(action).toMatch(/error\?\.code === "42501"/);
    expect(action).toMatch(/errors\.beliefsConsent/);
  });
});
