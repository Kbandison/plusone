import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const page = read("./page.tsx");
const photos = read("./photos/page.tsx");
const distance = read("./distance/page.tsx");
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
 */
describe("photos can be changed after onboarding", () => {
  it("has a home under Profile", () => {
    expect(existsSync(fileURLToPath(new URL("./photos/page.tsx", import.meta.url)))).toBe(true);
    expect(page).toMatch(/href="\/app\/profile\/photos"/);
  });

  /** Not a copy: a second gallery is a second set of upload rules to keep. */
  it("reuses the gallery rather than rebuilding it", () => {
    expect(photos).toMatch(/from "@\/app\/onboarding\/photos\/photos-form"/);
    expect(photos).toMatch(/PhotoGallery/);
    expect(photos).toMatch(/PhotoUploader/);
    expect(photos).toMatch(/PrivacyChoice/);
  });

  it("still respects the ceiling", () => {
    expect(photos).toMatch(/photos\.length < MAX_PHOTOS/);
  });
});

/**
 * The profile SHOWED the radius and could not change it. It decides who is in
 * tonight's Drop and who is in Browse — the most consequential number a member
 * owns — and it was set once on the way in and then frozen.
 */
describe("the search radius can be changed", () => {
  it("has a home under Profile", () => {
    expect(page).toMatch(/href="\/app\/profile\/distance"/);
    expect(distance).toMatch(/from "@\/app\/onboarding\/radius\/radius-form"/);
  });

  /** A literal 50 in the JSX is a default that disagrees with the one config holds. */
  it("takes its default from config rather than a literal", () => {
    expect(page).toMatch(/RADIUS\.defaultMi/);
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
