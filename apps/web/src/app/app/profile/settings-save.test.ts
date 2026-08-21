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
const quizForm = withoutComments(read("../../onboarding/quiz/quiz-form.tsx"));
const quizAction = withoutComments(read("./quiz-actions.ts"));

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
    expect(photos).toMatch(
      /if \(!settings\) return;[\s\S]{0,80}form\.current\?\.requestSubmit\(\)/,
    );
  });

  /**
   * On release, not on every step of the drag. onChange fires per increment,
   * and a slider dragged the width of its track would be fifty writes.
   */
  it("commits the radius on release rather than per pixel", () => {
    expect(radiusForm).toMatch(/onPointerUp: commit, onKeyUp: commit, onTouchEnd: commit/);
    expect(radiusForm).toMatch(
      /const commit = \(\) => \{[\s\S]{0,120}form\.current\?\.requestSubmit\(\)/,
    );
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

/**
 * "Saved" is a report on something that happened, not a greeting.
 *
 * On load it is a claim about an action nobody took — and the one time the word
 * matters, when a save genuinely fails, it was already on screen before the
 * attempt and stays there after it.
 */
describe("nothing says it saved before anything was saved", () => {
  it.each([
    ["photos", photos],
    ["radius", radiusForm],
    ["quiz", quizForm],
  ])("%s reports only once the member has changed something", (_label, source) => {
    expect(source).toMatch(/const \[touched, setTouched\] = useState\(false\)/);
    expect(source).toMatch(/setTouched\(true\)/);
    // Prettier breaks the nested ternary across six lines in the quiz form,
    // so the window has to clear that rather than the shortest spelling.
    expect(source).toMatch(/touched \? \([\s\S]{0,300}settingSaved/);
  });

  /** One pair of strings, not one per screen that happened to need them. */
  it("shares the words rather than owning them", () => {
    for (const source of [photos, radiusForm, quizForm]) {
      expect(source).toMatch(/DRAFT_COPY\.app\.settingSaved/);
      expect(source).not.toMatch(/privacySaved/);
    }
  });
});

/**
 * The heading is the field, and a heading that grows a frame when you touch it
 * is a heading that jumps. The caret is the focus indicator — which is what a
 * caret is for, and the one control here where the browser's own outline would
 * say less than the thing already blinking inside it.
 */
describe("the name does not become a box when you click it", () => {
  it("changes no border, no fill and no padding on focus", () => {
    const editing = name.slice(name.indexOf("editing ?"));
    expect(editing.slice(0, 160)).not.toMatch(/border-accent|bg-surface|px-3|py-1"/);
    expect(name).toMatch(/outline-none/);
  });
});

/**
 * "Skip for now" was a one-way door.
 *
 * A skip writes an EMPTY row, and resolveStep reads presence rather than
 * content — so the step settles, never returns, and nothing anywhere in /app
 * linked to it. A member who took the app at its word on step 8 had no way back
 * to the twelve questions that shape every Drop they will ever see.
 */
describe("the quiz can be taken after it was skipped", () => {
  it("is on the profile, with what is answered so far on the outside", () => {
    expect(page).toMatch(/<QuizForm answered=\{quizAnswers\} save=\{saveQuizSetting\} \/>/);
    expect(page).toMatch(/DRAFT_COPY\.quiz\.progress\(/);
    expect(page).toMatch(/ownQuizAnswers\(auth\.user\.id\)/);
  });

  /** Twelve fieldsets is longer than everything else on the page put together. */
  it("is folded until it is wanted", () => {
    expect(page).toMatch(/<CollapsibleSection[\s\S]{0,200}<QuizForm/);
  });

  it("saves each answer where it is tapped", () => {
    expect(quizForm).toMatch(/requestAnimationFrame\(\(\) => form\.current\?\.requestSubmit\(\)\)/);
    // Nothing to finish, nothing to skip, nowhere to go back to.
    expect(quizForm).toMatch(/settings \?[\s\S]{0,600}<StepActions/);
  });

  it("uses an action that stays on the page", () => {
    expect(quizAction).not.toMatch(/requireStep|nextRoute/);
    expect(quizAction).toMatch(/revalidatePath/);
  });

  /**
   * Answers and vector together: storing answers alone would mean recomputing
   * on every read with whatever the weights happen to be that week, and a
   * member's compatibility changing because a question was reworded is not
   * something they could ever see.
   */
  it("writes the vector with the answers", () => {
    expect(quizAction).toMatch(/trait_vector: quiz\.traitVector\(answers\)/);
    expect(quizAction).toMatch(/onConflict: "user_id"/);
  });
});
