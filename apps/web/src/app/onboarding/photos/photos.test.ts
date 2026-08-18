import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DRAFT_COPY } from "@plusone/config";

import { MAX_PHOTOS } from "@/lib/photo-limits";

const read = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");
const form = read("./photos-form.tsx");
const actions = read("./actions.ts")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

describe("the picker takes more than one photo", () => {
  it("accepts a multiple selection", () => {
    expect(form).toMatch(/\n\s+multiple\n/);
    expect(form).toMatch(/Array\.from\(event\.currentTarget\.files/);
  });

  /**
   * `position` is chosen by counting existing rows, and `unique (user_id,
   * position)` refuses a duplicate. Two uploads in flight together read the
   * same count and one of them loses — so they go up one at a time, which means
   * awaiting each result, which a useActionState dispatch cannot give.
   */
  it("uploads them one at a time rather than all at once", () => {
    expect(form).toMatch(/for \(const \[index, file\] of queue\.entries\(\)\)/);
    expect(form).toMatch(/await uploadPhoto\(/);
    // The tell for a parallel rewrite creeping back in.
    expect(form).not.toMatch(/Promise\.all\([^)]*uploadPhoto/);
    expect(form).not.toMatch(/\.map\([^)]*uploadPhoto/);
  });

  /** Stop on the first refusal instead of pushing the rest at a server that said no. */
  it("stops the queue when one is refused", () => {
    const loop = form.slice(
      form.indexOf("for (const [index, file]"),
      form.indexOf("setProgress(null)"),
    );
    expect(loop).toMatch(/if \(result\.error\)/);
    expect((loop.match(/break;/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("the six-photo ceiling is told, not discovered", () => {
  /** profile_photos_position_range: CHECK (position >= 0 AND position <= 5). */
  it("matches the database constraint", () => {
    expect(MAX_PHOTOS).toBe(6);
  });

  /**
   * The browser decides how many will fit BEFORE sending any. Without this the
   * extras upload, fail the constraint, and return "that did not upload, try
   * again" — advice that would fail every time it was followed.
   */
  it("is checked in the browser before anything is sent", () => {
    expect(form).toMatch(/const room = MAX_PHOTOS - count/);
    expect(form).toMatch(/picked\.slice\(0, room\)/);
  });

  /**
   * And enforced on the server, which is the wall. Before the transforms, so a
   * refusal does not cost three image resizes and three storage writes first.
   */
  it("is enforced on the server before any work is done", () => {
    const before = actions.slice(0, actions.indexOf("processPhoto("));
    expect(before).toMatch(/>= MAX_PHOTOS/);
    expect(before).toMatch(/E\.full\(MAX_PHOTOS\)/);
  });

  it("says the limit rather than blaming the upload", () => {
    expect(DRAFT_COPY.photos.errors.full(6)).toMatch(/6/);
    expect(DRAFT_COPY.photos.errors.full(6)).not.toMatch(/try again/i);
  });
});

describe("the strings live in draft copy, not in the component", () => {
  it("keeps the progress and count lines out of the markup", () => {
    expect(form).not.toMatch(/"Uploading…"/);
    expect(form).not.toMatch(/photos" : "photo/);
    expect(DRAFT_COPY.photos.uploading(2, 5)).toBe("Uploading 2 of 5…");
    expect(DRAFT_COPY.photos.uploading(1, 1)).toBe("Uploading…");
    expect(DRAFT_COPY.photos.added(1)).toBe("1 photo added.");
    expect(DRAFT_COPY.photos.added(3)).toBe("3 photos added.");
  });
});
