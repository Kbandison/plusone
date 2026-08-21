import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

/**
 * Assertions read code, not the prose around it.
 *
 * Every one of these files explains in a comment what it deliberately does not
 * do — "not requireStep", "not the onboarding action" — and a regex looking for
 * the absence of a word finds it in the sentence saying it is absent.
 */
const withoutComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
const name = withoutComments(read("./name-editor.tsx"));
const page = read("./page.tsx");
const photos = read("../../onboarding/photos/photos-form.tsx");
const radiusForm = read("../../onboarding/radius/radius-form.tsx");
const radiusAction = withoutComments(read("./radius-actions.ts"));
const intention = read("./intention-editor.tsx");
const intentionAction = withoutComments(read("./intention-actions.ts"));

/**
 * A settings screen with a Save button is a screen that can be left in a state
 * the member believes they chose and the database has never heard of. Every
 * control on this page commits on its own.
 */
describe("the profile saves as you go", () => {
  it("keeps no step chrome on the page", () => {
    // StepActions renders Continue and Back — the buttons of a flow, on a
    // screen nobody is walking through.
    expect(page).not.toMatch(/StepActions/);
    for (const [file, label] of [
      [photos, "photos"],
      [radiusForm, "radius"],
    ] as const) {
      // Still there for onboarding, but behind the branch the profile misses.
      expect(file, label).toMatch(/settings \?[\s\S]{0,400}<StepActions/);
    }
  });

  it("commits the privacy choice when it is chosen", () => {
    expect(photos).toMatch(/onChange=\{saveNow\}/);
    expect(photos).toMatch(/if \(settings\) form\.current\?\.requestSubmit\(\)/);
  });

  /**
   * On release, not on every step of the drag. onChange fires per increment,
   * and a slider dragged the width of its track would be fifty writes.
   */
  it("commits the radius on release rather than per pixel", () => {
    expect(radiusForm).toMatch(/onPointerUp: \(\) => form\.current\?\.requestSubmit\(\)/);
    expect(radiusForm).toMatch(/onKeyUp: \(\) => form\.current\?\.requestSubmit\(\)/);
    const onChange = radiusForm.slice(radiusForm.indexOf("onChange={(event) => setRadius"));
    expect(onChange.slice(0, 120)).not.toMatch(/requestSubmit/);
  });

  /**
   * Not the onboarding action. That one calls requireStep, which a finished
   * member fails, and ends in a redirect to the next step — so reusing it would
   * have thrown a member out of their own profile.
   */
  it("uses an action that stays on the page", () => {
    expect(radiusAction).not.toMatch(/requireStep|nextRoute/);
    expect(intentionAction).not.toMatch(/requireStep|nextRoute/);
    expect(radiusAction).toMatch(/revalidatePath/);
  });

  /** The permission prompt belongs to the step that asks; a slider does not. */
  it("never asks a settled member for their location again", () => {
    expect(radiusAction).not.toMatch(/set_my_location/);
    expect(page).toMatch(/save=\{saveRadiusSetting\}/);
  });
});

/**
 * The heading IS the field. A labelled box and a Save button under a heading
 * showing the same name is two names on one screen.
 */
describe("the name is edited where it is shown", () => {
  it("has no separate box or button", () => {
    expect(name).not.toMatch(/profileNameSave\b/);
    expect(name).not.toMatch(/type="submit"/);
    expect(name).toMatch(/<h1/);
  });

  it("saves when the member leaves it", () => {
    expect(name).toMatch(/onBlur=\{commit\}/);
    expect(name).toMatch(/form\.current\?\.requestSubmit\(\)/);
  });

  /**
   * Blur fires on every exit, including the ones where nothing was typed —
   * without this, tabbing through the page would POST the same name each pass.
   */
  it("does not save a name that did not change", () => {
    expect(name).toMatch(/if \(next === committed\.current\)[\s\S]{0,120}return;/);
  });

  /** An empty heading is not a change anybody meant to make. */
  it("restores the name rather than clearing it", () => {
    expect(name).toMatch(/if \(!next\)[\s\S]{0,160}setValue\(committed\.current\)/);
  });

  it("leaves on Enter and reverts on Escape", () => {
    expect(name).toMatch(/event\.key === "Enter"/);
    expect(name).toMatch(/event\.key === "Escape"[\s\S]{0,120}setValue\(committed\.current\)/);
  });
});

/**
 * §3.4: the intention can change once every thirty days. The profile printed
 * that rule and gave a member no way to use it — the answer that decides who is
 * in their Drop was, in practice, permanent.
 */
describe("what you are here for can change, once a month", () => {
  it("offers every option, not a line of text", () => {
    expect(intention).toMatch(/<select/);
    expect(intention).toMatch(/Object\.keys\(INTENTION_LABELS\)/);
  });

  it("greys the control out while the clock is running", () => {
    expect(intention).toMatch(/const locked = changeableOn !== null/);
    expect(intention).toMatch(/disabled=\{locked \|\| pending\}/);
    expect(intention).toMatch(/C\.profileIntentionLocked\(changeableOn\)/);
  });

  /** Disabled is a courtesy. change_intention is the rule. */
  it("still goes through the RPC that holds the lock", () => {
    expect(intentionAction).toMatch(/rpc\("change_intention"/);
    expect(intentionAction).not.toMatch(/\.update\(\{ intention/);
  });

  /**
   * The cooldown raises P0001 with the date in it, and that date is the only
   * useful thing this screen can say — but it goes through memberFacingError
   * rather than straight out, because one action that skips that function is
   * the hole every other one was closed to prevent.
   */
  it("shows the date without passing the database through", () => {
    expect(intentionAction).toMatch(/memberFacingError\(error,/);
    expect(intentionAction).not.toMatch(/error: error\.message/);
  });

  /**
   * intention_changed_at is `not null default now()`, so a profile that has
   * never chosen still carries a clock — the same reason change_intention skips
   * the check when the intention is null. Read one without the other and the
   * page locks a control nobody has used.
   */
  it("does not lock a member out of a choice they have not made", () => {
    expect(page).toMatch(/intention && changedAt/);
    expect(page).toMatch(/intention_changed_at/);
  });
});

/**
 * The page rendered a read-only list of prompts under "Your prompts" and then
 * the editor under "Your prompts" — two sections with one heading between them,
 * one of which could not be used.
 */
describe("prompts are shown once", () => {
  it("leaves only the editor", () => {
    expect(page).toMatch(/<PromptEditor answers=\{prompts\} \/>/);
    expect(page).not.toMatch(/promptQuestion/);
    expect(page.match(/promptsHeading/g) ?? []).toHaveLength(0);
  });
});
