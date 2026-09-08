import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const noComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

const panel = noComments(read("./connect-panel.tsx"));
const lib = noComments(read("../../../../lib/photo-urls.ts"));

/**
 * BACKLOG 27d — the screen where somebody decides whether to reach out showed
 * one photograph.
 *
 * Everything here guards the same thing from two directions: the gallery must
 * show MORE than the cards do, and it must decide NOTHING about what may be
 * shown. The second is the half that could hurt somebody.
 */
describe("the whole gallery, and the view still decides what is in it", () => {
  it("reads visible_profile_photos, not profile_photos", () => {
    // profile_photos is the raw table. Reading it here would hand a stranger
    // every photo a member owns, including the ones 18b's per-photo privacy
    // exists to withhold.
    const fn = /export async function galleryFor[\s\S]*?\n}/.exec(lib)?.[0] ?? "";
    expect(fn.length).toBeGreaterThan(200);
    expect(fn).toMatch(/from\("visible_profile_photos"\)/);
    expect(fn).not.toMatch(/from\("profile_photos"\)/);
  });

  it("does not filter to the first photo, which is what the cards do", () => {
    // .eq("position", 0) is exactly the line that made this a one-photo screen.
    const fn = /export async function galleryFor[\s\S]*?\n}/.exec(lib)?.[0] ?? "";
    expect(fn).not.toMatch(/\.eq\("position", 0\)/);
    expect(fn).toMatch(/\.order\("position"/);
  });

  it("carries each photo's own blur state rather than one for the member", () => {
    // A member can blur photo three and leave one and two clear (18b). A single
    // is_blurred for the whole gallery would either expose the blurred one or
    // hide the clear ones.
    const fn = /export async function galleryFor[\s\S]*?\n}/.exec(lib)?.[0] ?? "";
    expect(fn).toMatch(/is_blurred/);
    expect(fn).toMatch(/isBlurred: Boolean\(row\.is_blurred\)/);
  });

  it("renders the gallery on the panel, past the first", () => {
    // The first is the frame beside their name, so the grid starts at the
    // second — showing it twice reads as a mistake.
    expect(panel).toMatch(/galleryFor\(target\.id as string\)/);
    expect(panel).toMatch(/gallery\.slice\(1\)/);
    expect(panel).toMatch(/gallery\.length > 1/);
  });

  it("never applies blur in CSS", () => {
    // The view swaps in a different OBJECT. A CSS filter would mean the clear
    // file reached the browser and a member could read it off the network tab —
    // the whole point of doing it server-side.
    expect(panel).not.toMatch(/blur-/);
    expect(panel).not.toMatch(/filter:\s*blur/);
  });
});
