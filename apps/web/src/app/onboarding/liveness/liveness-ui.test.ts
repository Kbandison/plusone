import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DRAFT_COPY } from "@plusone/config";

const read = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");
const capture = read("./liveness-capture.tsx");
const theme = read("./liveness-theme.css");

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
  it("styles only through tokens, never through Amplify class names", () => {
    expect(theme).not.toMatch(/\.amplify-/);
    const declarations = theme.match(/^\s+[a-z-]+:/gm) ?? [];
    for (const declaration of declarations) {
      expect(declaration.trim()).toMatch(/^--amplify-/);
    }
  });

  /**
   * Everything resolves through this app's own variables, which is what makes
   * Dusk free: --surface and --ink are already redefined under the dark theme.
   * A literal hex here would be a second palette to keep in step, and it would
   * be wrong in one of the two themes the day it was written.
   */
  it("hardcodes no colour of its own", () => {
    expect(theme).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(theme).not.toMatch(/\brgba?\(/);
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
