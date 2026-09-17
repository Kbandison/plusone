import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { COOLDOWNS, DRAFT_COPY } from "@plusone/config";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const page = read("./page.tsx");
const copy = read("../../../../../../packages/config/src/draft-copy.ts");
const layout = read("../layout.tsx");
const intention = read("./intention-editor.tsx");
const modeToggle = read("./mode-toggle.tsx");
const MIGRATION_DIR = fileURLToPath(
  new URL("../../../../../../supabase/migrations/", import.meta.url),
);
const MIGRATIONS = readdirSync(MIGRATION_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(MIGRATION_DIR, f), "utf8"));

/** Comments out, so nothing below is satisfied by prose describing it. */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

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
    // `settings` is the assertion; the prop list around it is not. It grew a
    // `premium` prop for server 18b and this pinned the whole opening tag.
    expect(page).toMatch(/<PhotoGallery[^>]*photos=\{photoList\}/);
    expect(page).toMatch(/<PhotoGallery[^>]*\bsettings\b/);
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
    // Three, not four. Four blocks became folds on 2026-09-13 and a fold brings
    // its own spacing; the rule is still one constant for every break that is
    // still drawn.
    expect(page.match(/\{SECTION\}/g)?.length).toBeGreaterThanOrEqual(3);
    // FIRST_SECTION is gone with them. It gave the photo block less room than a
    // section because it sat under the member's face; the first group label now
    // does that job and says something while doing it.
    // Comments stripped. The constant's own removal note names it, so a
    // whole-file match is answered by the sentence explaining the absence.
    const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/FIRST_SECTION/);
    expect(page.match(/\{GROUP\}/g)?.length).toBe(2);
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
    for (const key of ["profileLookingFor", "profileRadius", "profileModeHeading"]) {
      expect(page, key).toMatch(new RegExp(`C\\.${key}\\b`));
    }
    // The intention moved out of the page and into a control that can change
    // it, and took its two strings with it.
    for (const key of ["profileNotSet", "profileIntentionLocked"]) {
      expect(intention, key).toMatch(new RegExp(`C\\.${key}\\b`));
    }
  });

  it("leaves the mode toggle under a heading rather than loose at the bottom", () => {
    expect(page).toMatch(/\{C\.profileModeHeading\}<\/h2>\s*\n\s*<ModeToggle/);
  });
});

/**
 * `bare` is what stops the fold showing its heading twice.
 *
 * Both editors are self-contained cards with their own <section> and <h2>.
 * Inside a CollapsibleSection the section owns both, so the editor has to give
 * them up — and if it quietly stopped doing that, the page would render the
 * word you just tapped again directly underneath it. Nothing checked this until
 * a sabotage removed the suppression and every test still passed.
 */
describe("an editor inside a fold gives up its frame", () => {
  it.each(["bio-editor.tsx", "prompt-editor.tsx"])("%s", (file) => {
    const src = read(`./${file}`);
    // The heading is conditional on bare.
    expect(src).toMatch(/\{bare \? null : <h2/);
    // So is the card, or the fold would sit inside a second border.
    expect(src).toMatch(/className=\{bare \? "" : "mt-10 rounded-xl/);
  });

  it("and the page always asks for it", () => {
    // A fold whose child brought its own heading would show two.
    expect(page).toMatch(/<BioEditor[^/]*bare/s);
    expect(page).toMatch(/<PromptEditor[^/]*bare/s);
  });
});

/**
 * Support-only is a one-way door for thirty days, and nothing said so.
 *
 * Found by Kevin testing the toggle on 2026-09-16: he switched to see what it
 * did and could not switch back. `switch_mode` stamps
 * `mode_dating_reentry_at = now() + cooldowns.dating_reentry_days` on the way
 * in and refuses the way out until it passes.
 *
 * The mechanic is right — the shield is never gated and the cooldown stops
 * toggle-flicker gaming of a visibility setting. What was wrong is that the
 * only place the thirty days appeared was the error a month later, on the way
 * out. It mattered immediately: 45 testers were about to be handed this app and
 * told to poke at everything, and unlike Kevin they cannot ask for it to be
 * undone.
 */
describe("the support-only switch says what it costs", () => {
  const toggle = strip(modeToggle);

  it("finds the component at all", () => {
    // The floor. Stripping comments from a heavily-commented file can leave
    // very little, and every assertion below is vacuous against "".
    expect(toggle).toMatch(/export function ModeToggle/);
  });

  it("warns BEFORE the switch, not after it", () => {
    // The whole finding. Shown in dating mode, which is the only moment the
    // warning can change a decision.
    expect(toggle).toMatch(/mode === "dating" \?/);
    expect(toggle).toMatch(/supportOnlyCooldown\(COOLDOWNS\.datingReentryDays\)/);
  });

  it("is one sentence", () => {
    // The same standard the beta checklist rows are held to, applied here
    // because it was written the same day with the same habit: it read
    // "…for 30 days. The shield is instant; coming out of it is not." The first
    // sentence is the warning; the second is a flourish about the design.
    //
    // A sabotage put the flourish back and nothing failed, because no guard
    // covered this string at all. This is that rule, not a new one.
    const warning = DRAFT_COPY.app.supportOnlyCooldown(COOLDOWNS.datingReentryDays);
    expect(warning.split(/(?<=[.?])\s+/).length).toBe(1);
    expect(warning.trim()).toMatch(/\.$/);
  });

  it("takes the number from config rather than typing it", () => {
    // A warning that says thirty while the database says sixty is worse than no
    // warning: it is a promise the product does not keep.
    expect(toggle).not.toMatch(/\b30 days\b/);
    expect(strip(copy)).toMatch(/supportOnlyCooldown: \(days: number\)/);
  });

  it("says the date once somebody is inside the window", () => {
    // A different question from "what will this cost me" — somebody already in
    // support-only wants to know when they can leave, which wants a date.
    expect(toggle).toMatch(/supportOnlyLockedUntil\(datingAgainOn\)/);
  });

  it("disables the button while the cooldown runs", () => {
    // Otherwise the screen offers a door that opens onto a wall: switch_mode
    // raises, and the member meets the refusal only after pressing.
    expect(toggle).toMatch(/disabled=\{pending \|\| locked\}/);
    expect(toggle).toMatch(/mode === "support_only" && datingAgainOn !== null/);
  });

  it("computes the date on the server, beside the cooldown it mirrors", () => {
    // Date.now() is impure and a client component re-renders against it. The
    // intention cooldown two fields up is computed the same way for the same
    // reason.
    const server = strip(page);
    expect(server).toMatch(/mode_dating_reentry_at/);
    expect(server).toMatch(/datingAgainOn=\{datingAgainOn\}/);
    expect(toggle).not.toMatch(/Date\.now\(\)/);
  });

  it("reads the column it needs, or the page renders nothing at all", () => {
    // PostgREST fails the WHOLE request on an unknown column, so a select that
    // names one the schema does not have blanks the entire profile — which has
    // happened here before. The column is live; this pins the select naming it.
    expect(strip(page)).toMatch(/"display_name,[^"]*mode_dating_reentry_at/);
  });

  it("keeps the number the same in all three places it is written", () => {
    // THE SCREEN NOW QUOTES THIS NUMBER TO A MEMBER, which is what makes the
    // three copies a correctness problem rather than tidiness. They are:
    //
    //   COOLDOWNS.datingReentryDays   what the warning renders
    //   switch_mode's config_int fallback   what the RPC enforces with no override
    //   the app_config seed row       the override that is actually in the database
    //
    // A warning saying thirty over a wall of sixty is a promise the product
    // does not keep, and nothing else would notice.
    const days = COOLDOWNS.datingReentryDays;
    expect(days).toBe(30);

    const sql = MIGRATIONS.filter((f) => f.includes("cooldowns.dating_reentry_days"));
    // The floor: a filter that matches nothing makes the loop below vacuous.
    expect(sql.length).toBeGreaterThanOrEqual(2);
    for (const file of sql) {
      const fallback = /config_int\('cooldowns\.dating_reentry_days',\s*(\d+)\)/.exec(file);
      const seed = /'cooldowns\.dating_reentry_days',\s*to_jsonb\((\d+)\)/.exec(file);
      if (fallback) expect(Number(fallback[1])).toBe(days);
      if (seed) expect(Number(seed[1])).toBe(days);
    }
  });
});
