import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const page = read("./page.tsx");
const copy = read("../../../../../../packages/config/src/draft-copy.ts");
const layout = read("../layout.tsx");

describe("the section is called Profile", () => {
  it("says so in the nav and on the page", () => {
    expect(copy).toMatch(/navProfile: "Profile"/);
    expect(page).toMatch(/title: DRAFT_COPY\.app\.profileHeading/);
  });

  /** The fallback when a member has no display name was the old word too. */
  it("leaves no 'You' behind", () => {
    expect(page).not.toMatch(/"You"/);
    expect(layout).not.toMatch(/"You"/);
  });
});

/**
 * The gallery — upload, delete, reorder, and the blurred-until-connected choice
 * — has existed since Milestone 2 and lived only at /onboarding/photos. A
 * finished member can still reach that URL and would never think to look for
 * it, so the picture other people judge you by was in practice unchangeable
 * after the day you signed up.
 *
 * A link to a screen was the first fix and still asked somebody to go
 * somewhere to do the most ordinary thing on this page.
 */
describe("photos are managed here, not linked to", () => {
  it("renders the gallery on the profile itself", () => {
    expect(page).toMatch(/<PhotoGallery photos=\{photoList\}>/);
    expect(page).toMatch(/<PhotoUploader count=\{photoList\.length\} \/>/);
    expect(page).toMatch(/<PrivacyChoice/);
    expect(page).not.toMatch(/href="\/app\/profile\/photos"/);
  });

  /** Not a copy: a second gallery is a second set of upload rules to keep. */
  it("reuses the one that exists", () => {
    expect(page).toMatch(/from "@\/app\/onboarding\/photos\/photos-form"/);
  });

  it("still respects the ceiling", () => {
    expect(page).toMatch(/photoList\.length < MAX_PHOTOS/);
  });
});

/**
 * It decides who is in tonight's Drop and who is in Browse — the most
 * consequential number a member owns — and it was shown here and changeable
 * somewhere else.
 */
describe("the distance is a slider on the page", () => {
  it("renders the radius form rather than linking away", () => {
    expect(page).toMatch(/<RadiusForm/);
    expect(page).toMatch(/from "@\/app\/onboarding\/radius\/radius-form"/);
    expect(page).not.toMatch(/href="\/app\/profile\/distance"/);
  });

  /** A literal 50 in the JSX is a default that disagrees with config's. */
  it("takes its default from config rather than a literal", () => {
    expect(page).toMatch(/RADIUS\.defaultMi/);
  });
});

/**
 * The name was set once in onboarding and never again — and it is the word
 * every other member sees on every connect, every chat and every room post they
 * did not write anonymously. A typo in it was permanent.
 */
describe("the name is editable", () => {
  const actions = read("./name-actions.ts");
  const editor = read("./name-editor.tsx");

  it("is on the page", () => {
    expect(page).toMatch(/<NameEditor name=/);
  });

  /** The same two rules the onboarding step applies, on the same column. */
  it("applies the rules the way in applied", () => {
    expect(actions).toMatch(/E\.nameRequired/);
    expect(actions).toMatch(/E\.nameTooLong/);
    expect(actions).toMatch(/displayName\.length > MAX_DISPLAY_NAME/);
  });

  /**
   * A local const in one action was fine until a second screen could change the
   * same column; then it was two numbers for one constraint.
   */
  it("shares one ceiling with onboarding and the column", () => {
    const basics = read("../../onboarding/basics/actions.ts");
    const mechanics = read("../../../../../../packages/config/src/mechanics.ts");
    expect(basics).toMatch(/MAX_DISPLAY_NAME/);
    expect(basics).not.toMatch(/const MAX_NAME/);
    expect(editor).toMatch(/maxLength=\{MAX_DISPLAY_NAME\}/);
    expect(mechanics).toMatch(/export const MAX_DISPLAY_NAME = 40/);
  });

  /** A name shows on every surface, so every surface has to be told. */
  it("revalidates more than this page", () => {
    expect(actions).toMatch(/\["\/app", "\/app\/profile", "\/app\/inbox", "\/app\/rooms"\]/);
  });
});

/**
 * They were a hairline apiece and read as accidental gaps.
 */
describe("the sections are told apart", () => {
  it("uses one rule for every break", () => {
    expect(page).toMatch(/const SECTION = "mt-14 border-t-2 border-line-2 pt-10"/);
    expect(page.match(/\{SECTION\}/g)?.length).toBeGreaterThanOrEqual(4);
  });

  /** Four literals would have drifted the first time one was made heavier. */
  it("leaves no section styling itself", () => {
    expect(page).not.toMatch(/mt-16 border-t border-line pt-10/);
  });
});

/**
 * Every other screen reads its copy from DRAFT_COPY, and one that does not is
 * one the copy tests cannot see.
 */
describe("the page has no words of its own", () => {
  it("reads its labels from the copy file", () => {
    for (const key of [
      "profileLookingFor",
      "profileNotSet",
      "profileRadius",
      "profilePhotosHeading",
      "profileModeHeading",
    ]) {
      expect(page, key).toMatch(new RegExp(`C\\.${key}\\b`));
    }
  });

  it("leaves the mode toggle under a heading rather than loose at the bottom", () => {
    expect(page).toMatch(/\{C\.profileModeHeading\}<\/h2>\s*\n\s*<ModeToggle/);
  });
});
