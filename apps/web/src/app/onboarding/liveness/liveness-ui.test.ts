import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DRAFT_COPY } from "@plusone/config";

const read = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");
const capture = read("./liveness-capture.tsx");
const theme = read("./liveness-theme.css");
/** Comments here quote the vendor's own hex values; strip before matching. */
const themeCode = theme.replace(/\/\*[\s\S]*?\*\//g, "");
const vendorCss = readFileSync(
  createRequire(import.meta.url).resolve("@aws-amplify/ui-react/styles.css"),
  "utf8",
);

describe("the check is centred on the screen, not tucked into the step column", () => {
  /**
   * It used to sit in the 600px step column, under a progress bar, a heading
   * and a sign-out link — furniture competing for attention at the moment
   * somebody is asked to hold their face still in front of a camera.
   *
   * `fixed` matters specifically: it centres in the VIEWPORT rather than in the
   * document, and on a phone those are not the same place.
   */
  it("takes the viewport and centres in it", () => {
    expect(capture).toMatch(/fixed inset-0/);
    expect(capture).toMatch(/items-center/);
    expect(capture).toMatch(/justify-center/);
  });

  /** An opaque ground, or the step underneath shows through the camera. */
  it("covers what is behind it", () => {
    expect(capture).toMatch(/bg-ground/);
  });

  /** A small screen must still be able to reach the whole widget. */
  it("scrolls rather than clipping on a short screen", () => {
    expect(capture).toMatch(/overflow-y-auto/);
  });
});

describe("the AWS widget wears this app's palette", () => {
  it("carries the theme class", () => {
    expect(capture).toMatch(/liveness-theme/);
    expect(capture).toMatch(/import "\.\/liveness-theme\.css"/);
  });

  /**
   * Tokens are the documented seam. Amplify's CLASS names are that package's
   * private surface and a minor release may rename them — a widget that
   * silently reverts to AWS blue after a dependency bump is worse than one that
   * never matched, because nobody goes looking.
   */
  it("sets nothing but tokens inside the theme block", () => {
    const block = themeCode.slice(themeCode.indexOf(".liveness-theme {"));
    const declarations = block.slice(0, block.indexOf("\n}")).match(/^\s+[a-z-]+:/gm) ?? [];
    expect(declarations.length).toBeGreaterThan(30);
    for (const declaration of declarations) {
      expect(declaration.trim()).toMatch(/^--amplify-/);
    }
  });

  /**
   * The exceptions, pinned.
   *
   * Three rules in the shipped stylesheet write `background-color: #fff`
   * literally, so there is no variable to redefine and no way to reach them
   * except by class name. Overriding them breaks the rule above on purpose, in
   * exactly these three places — a white cancel button and a white "Rec" badge
   * on this app's ground during the check is the report that prompted it.
   *
   * Each is verified against the vendor stylesheet as it exists in the tree, so
   * the day Amplify tokenises one of these the test fails and the override
   * comes out, rather than quietly fighting a variable that now works.
   */
  const HARDCODED = [
    "amplify-liveness-cancel-button",
    "amplify-liveness-recording-icon",
    "amplify-liveness-figure__image",
  ];

  it("reaches for class names only where the vendor hardcoded a colour", () => {
    const targeted = [...themeCode.matchAll(/\.liveness-theme \.([a-z0-9_-]+)/gi)].map((m) => m[1]);
    expect([...new Set(targeted)].sort()).toEqual([...HARDCODED].sort());
  });

  it("each override still corresponds to a literal #fff upstream", () => {
    for (const className of HARDCODED) {
      const rule = new RegExp(`\\.${className}\\s*\\{[^}]*\\}`).exec(vendorCss);
      expect(rule, `${className} no longer exists in the Amplify stylesheet`).not.toBeNull();
      expect(rule![0], `${className} is tokenised now — drop the override`).toMatch(/#fff\b/i);
    }
  });

  /**
   * The recording view reaches past the semantic tokens into the base ramp, so
   * mapping only the semantic layer themed the start screen and left the check
   * itself in AWS's colours — which is exactly what came back.
   */
  it("maps the raw ramp the recording view actually uses", () => {
    for (const token of [
      "--amplify-colors-white",
      "--amplify-colors-primary-80",
      "--amplify-colors-neutral-40",
      "--amplify-colors-blue-10",
      "--amplify-colors-red-80",
      "--amplify-colors-overlay-40",
    ]) {
      expect(themeCode).toContain(token);
    }
  });

  /**
   * Everything resolves through this app's own variables, which is what makes
   * Dusk free: --surface and --ink are already redefined under the dark theme.
   * A literal hex here would be a second palette to keep in step, and it would
   * be wrong in one of the two themes the day it was written.
   */
  it("hardcodes no colour of its own", () => {
    expect(themeCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(themeCode).not.toMatch(/\brgba?\(/);
    expect(themeCode).not.toMatch(/\bhsla?\(/);
  });
});

describe("the camera speaks this app's words", () => {
  const C = DRAFT_COPY.liveness.camera;

  it("is handed to the component", () => {
    expect(capture).toMatch(/displayText=\{DRAFT_COPY\.liveness\.camera\}/);
  });

  /**
   * The strings AWS ships. Each was appearing verbatim in the middle of this
   * app, on the one screen where sounding like a stranger's software costs the
   * most.
   */
  it("leaves none of AWS's defaults in place", () => {
    const theirs = [
      "Move face in front of camera",
      "Ensure only one face is in front of camera",
      "Client error",
      "Check failed due to client issue",
      "Server issue",
      "Cannot complete check due to server issue",
      "Start video check",
      "Cancel Liveness check",
      "Webcam for liveness check",
      "Move to dimmer area",
      "Move to brighter area",
    ];
    const ours = Object.values(C);
    for (const string of theirs) expect(ours).not.toContain(string);
  });

  it("leaves nothing blank", () => {
    for (const [key, value] of Object.entries(C)) {
      expect(typeof value, key).toBe("string");
      expect(value.trim().length, key).toBeGreaterThan(0);
    }
  });

  /**
   * This is a camera screen and it knows nothing about who is in front of it.
   * No payload, subject, URL or analytics event in this app names a condition,
   * and the screen a member reaches while pointing a camera at their own face
   * is the last place to make an exception.
   */
  it("names no condition", () => {
    const forbidden = /\b(hsv|hiv|herpes|positive singles|diagnos|std|sti)\b/i;
    for (const [key, value] of Object.entries(C)) {
      expect(forbidden.test(value), `${key}: ${value}`).toBe(false);
    }
  });
});

/**
 * The one colour that is not CSS at all.
 *
 * During the check — not the start screen — Amplify paints the surround into a
 * <canvas> and hardcodes it:
 *
 *   ctx.fillStyle = isStartScreen
 *     ? getComputedStyle(canvas).getPropertyValue('--amplify-colors-background-primary')
 *     : '#fff';
 *
 * That is why the start screen took this app's palette and the recording view
 * stayed white. It is a canvas fill, so no token, class, prop or stylesheet can
 * reach it, and `components` only exposes the photosensitivity warning and the
 * error view.
 *
 * So it is patched, via pnpm's tracked patchedDependencies, to read the same
 * variable the start-screen branch two lines up already reads — AWS's own code,
 * applied to both branches. The `|| '#fff'` keeps their literal as the fallback.
 *
 * This test exists because a patch is the one kind of fix that can vanish
 * without anybody touching this repo: bump the version and pnpm drops it. If
 * that happens the check goes white again on a screen nobody looks at twice, so
 * it fails here instead.
 */
describe("the canvas fill is patched to follow the theme", () => {
  // The package's exports map refuses deep subpaths, so resolve the entry and
  // walk from there. dist/index.js carries the same drawing code as the ESM
  // build and both are patched; reading the entry keeps this independent of
  // which one the bundler happens to pick.
  const entry = createRequire(import.meta.url).resolve("@aws-amplify/ui-react-liveness");
  const drawn = readFileSync(entry, "utf8");

  it("reads the background token instead of hardcoding white", () => {
    expect(drawn).toMatch(
      /fillStyle = getComputedStyle\(canvas\)\.getPropertyValue\('--amplify-colors-background-primary'\)/,
    );
  });

  it("no longer takes the white branch during the check", () => {
    expect(drawn).not.toMatch(/fillStyle = isStartScreen/);
  });
});
