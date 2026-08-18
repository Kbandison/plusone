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
    expect(form).toMatch(/for \(const \[index, file\] of prepared\.entries\(\)\)/);
    expect(form).toMatch(/await uploadPhoto\(/);
    // The tell for a parallel rewrite creeping back in.
    expect(form).not.toMatch(/Promise\.all\([^)]*uploadPhoto/);
    expect(form).not.toMatch(/\.map\([^)]*uploadPhoto/);
  });

  /** Stop on the first refusal instead of pushing the rest at a server that said no. */
  /**
   * The uploads cannot overlap — `position` is counted and `unique (user_id,
   * position)` refuses a duplicate — but shrinking is pure browser work on
   * independent files. Inline, every upload waited on a canvas resize before it
   * could start, and six photos paid that six times in series.
   */
  it("shrinks them all in parallel before uploading in series", () => {
    expect(form).toMatch(/await Promise\.all\(queue\.map\(/);
    const loop = form.slice(form.indexOf("for (const [index, file] of prepared"));
    expect(loop).not.toMatch(/downscalePhoto/);
  });

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
    expect(form).toMatch(/if \(picked\.length > room\)/);
  });

  /**
   * Said the moment the picker closes, not after the ones that fit have gone
   * up. Picking seven meant sitting through six uploads to be told the seventh
   * was never going anywhere — a message attached to a batch that had in fact
   * succeeded. It now cancels the whole selection, which the batch tests below
   * cover; this only asserts that the decision happens before any network work.
   */
  it("decides before a single upload starts", () => {
    const beforeLoop = form.slice(0, form.indexOf("startUploading("));
    expect(beforeLoop).toMatch(/setError\(C\.errors\.tooMany\(picked\.length, room\)\)/);
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

/**
 * Picking more than fits used to upload the ones that did and complain
 * afterwards. That is the worst of both: the member waits out six uploads to be
 * told something failed, and the six that landed are whichever the file picker
 * listed first rather than the ones they would have chosen.
 */
describe("too many photos cancels the batch", () => {
  it("sends nothing at all when the selection overflows", () => {
    const beforeUpload = form.slice(0, form.indexOf("startUploading("));
    expect(beforeUpload).toMatch(/if \(picked\.length > room\) \{[\s\S]{0,200}?return;/);
  });

  it("no longer trims the selection down to what fits", () => {
    expect(form).not.toMatch(/picked\.slice\(0, room\)/);
  });

  it("says how many were picked and how many fit", () => {
    const message = DRAFT_COPY.photos.errors.tooMany(7, 6);
    expect(message).toMatch(/7/);
    expect(message).toMatch(/6/);
    expect(message).toMatch(/nothing was uploaded/i);
  });
});

/**
 * The step counted photos and never showed them — "3 photos added." and no way
 * to see which three. A member who uploaded the wrong picture, or filled all
 * six, had no move left except a new account.
 */
describe("the photos are shown, and can be removed", () => {
  it("renders the member's own photos", () => {
    expect(form).toMatch(/export function PhotoGallery/);
    expect(form).toMatch(/photos\.map\(/);
  });

  it("offers a remove control per photo", () => {
    expect(form).toMatch(/action=\{remove\}/);
    expect(form).toMatch(/name="photo_id"/);
  });

  /** A grid of identical "Remove" buttons is unusable by ear. */
  it("names each remove control", () => {
    expect(form).toMatch(/aria-label=\{C\.removeNamed\(index \+ 1\)\}/);
    expect(DRAFT_COPY.photos.removeNamed(2)).toMatch(/2/);
  });

  it("deletes the row and the objects behind it, scoped to the owner", () => {
    expect(actions).toMatch(/export async function deletePhoto/);
    const del = actions.slice(actions.indexOf("export async function deletePhoto"));
    expect(del).toMatch(/\.eq\("user_id", userId\)/);
    expect(del).toMatch(/storage\.from\(BUCKET\)\.remove\(paths\)/);
  });

  /** Double-tapping Remove is not an error. */
  it("treats an already-deleted photo as done", () => {
    const del = actions.slice(actions.indexOf("export async function deletePhoto"));
    expect(del).toMatch(/if \(!row\) \{[\s\S]{0,160}?return \{ error: null \}/);
  });
});
