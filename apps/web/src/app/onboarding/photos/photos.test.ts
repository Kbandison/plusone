import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DRAFT_COPY } from "@plusone/config";

import { MAX_PHOTOS } from "@/lib/photo-limits";

const read = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");
const form = read("./photos-form.tsx");
const page = read("./page.tsx");
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
    // The count line went with the redesign: the grid IS the count, and a
    // sentence repeating it under six visible photos was noise.
    expect(DRAFT_COPY.photos).not.toHaveProperty("added");
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

/**
 * `position` has always decided which photo is the main one — every card, drop
 * and profile reads the lowest — and nothing could change it. A member whose
 * best picture went up third had no way to promote it, and no way to reorder at
 * all.
 */
describe("photos are dragged into order", () => {
  /**
   * `draggable` and dragstart/dragover fire NOTHING on a touchscreen. Building
   * this on the HTML5 drag API would have worked on a desktop and been
   * invisible on the phones most members are holding.
   */
  it("uses pointer events rather than the HTML5 drag API", () => {
    expect(form).toMatch(/onPointerDown=/);
    expect(form).toMatch(/onPointerMove=/);
    expect(form).toMatch(/onPointerUp=/);
    expect(form).toMatch(/setPointerCapture/);
    expect(form).not.toMatch(/onDragStart=|onDragOver=|onDrop=/);
    // On the image, so a long-press does not try to drag the picture itself.
    expect(form).toMatch(/draggable=\{false\}/);
  });

  /** Without touch-action the browser scrolls the page instead of dragging. */
  it("stops the browser claiming the gesture", () => {
    expect(form).toMatch(/touch-none/);
  });

  it("does not start a drag from the delete control", () => {
    expect(form).toMatch(/data-no-drag/);
    expect(form).toMatch(/closest\("\[data-no-drag\]"\)/);
  });

  /**
   * Dragging is unusable by keyboard, and reordering is not decoration —
   * position 0 is the photo everybody sees. The arrows do the same move without
   * putting a visible control back on screen.
   */
  it("can be reordered from the keyboard", () => {
    expect(form).toMatch(/tabIndex=\{0\}/);
    expect(form).toMatch(/event\.key === "ArrowLeft"/);
    expect(form).toMatch(/event\.key === "ArrowRight"/);
    expect(form).toMatch(/aria-label=\{C\.dragNamed\(index \+ 1, order\.length\)\}/);
  });

  it("has no arrow buttons or make-main link left", () => {
    expect(form).not.toMatch(/value="earlier"|value="later"|value="main"/);
    expect(form).not.toMatch(/makeMainLabel/);
  });

  /** The first photo is the main one, and the member is told so and told how. */
  it("marks the first as main and says to drag", () => {
    expect(form).toMatch(/index === 0 \? \(?\s*<Badge/);
    expect(DRAFT_COPY.photos.orderHint).toMatch(/drag/i);
    expect(DRAFT_COPY.photos.orderHint).toMatch(/first/i);
  });
});

describe("the grid", () => {
  it("is centred", () => {
    expect(form).toMatch(/flex flex-wrap justify-center/);
  });

  it("deletes from a bin on the photo, not a button under it", () => {
    expect(form).toMatch(/function TrashIcon/);
    expect(form).toMatch(/absolute -top-2 -right-2/);
    expect(form).not.toMatch(/\{C\.removeLabel\}/);
  });

  /** The add control is a tile beside the last photo, not a panel above them. */
  it("puts the add tile in the grid", () => {
    expect(form).toMatch(/size-\[132px\][\s\S]{0,400}border-dashed/);
    expect(page).toMatch(/<PhotoGallery photos=\{photos\}>/);
    expect(page).toMatch(/uploaded < MAX_PHOTOS \? <PhotoUploader/);
  });

  it("uses the same tile size for photos and for the add control", () => {
    expect((form.match(/size-\[132px\]/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

/**
 * Reported: the page refreshes on every drop.
 *
 * revalidatePath re-renders the route and ships a new RSC payload in the
 * action's own response. That is right for an upload or a delete — the set
 * changed and the browser cannot know the new signed URLs — and wrong for a
 * reorder, which changes nothing the browser does not already have. It was
 * replacing the images with freshly signed copies of themselves and flashing
 * the whole grid to do it.
 */
describe("a reorder does not go through the router at all", () => {
  const route = readFileSync(
    fileURLToPath(new URL("../../api/photos/order/route.ts", import.meta.url)),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  /**
   * Removing revalidatePath stopped the images being re-signed and the page
   * still reloaded on every drop. A Server Action's response can carry a
   * re-rendered RSC payload, and the client cache is invalidated by
   * `cookies.set` as well as by revalidation — which reading the session
   * through supabase-ssr makes possible on any call.
   *
   * Nothing about saving an arrangement needs the router. The browser is
   * already showing the result; this is a write and an acknowledgement.
   */
  it("saves through a route handler rather than a server action", () => {
    expect(form).toMatch(/fetch\("\/api\/photos\/order"/);
    expect(form).not.toMatch(/reorderPhotos/);
    expect(actions).not.toMatch(/reorder_photos/);
    expect(route).toMatch(/export async function POST/);
  });

  it("never revalidates from the reorder path", () => {
    expect(route).not.toMatch(/revalidatePath|revalidateTag|updateTag/);
  });

  /** Uploads and deletes DO change the set, so both must still revalidate. */
  it("leaves upload and delete revalidating", () => {
    const upload = actions.slice(
      actions.indexOf("export async function uploadPhoto"),
      actions.indexOf("export async function savePhotoPrivacy"),
    );
    const remove = actions.slice(actions.indexOf("export async function deletePhoto"));
    expect(upload).toMatch(/revalidatePath\("\/onboarding\/photos"\)/);
    expect(remove).toMatch(/revalidatePath\("\/onboarding\/photos"\)/);
  });

  it("refuses a caller with no session", () => {
    expect(route).toMatch(
      /if \(!auth\.user\) return NextResponse\.json\(\{ ok: false \}, \{ status: 401 \}\)/,
    );
  });

  it("refuses anything that is not a list of ids", () => {
    expect(route).toMatch(/!Array\.isArray\(ids\)/);
    expect(route).toMatch(/typeof id !== "string"/);
  });

  /** The RPC is the wall; this stops a stale browser writing a wrong order. */
  it("writes nothing when the list is not exactly the member's set", () => {
    expect(route).toMatch(/mine\.size !== ids\.length/);
    expect(route).toMatch(/status: 409/);
  });

  /** A stale list is not the member's doing, so it must not be shouted about. */
  it("does not report a stale list as an error", () => {
    expect(form).toMatch(/response\.status !== 409/);
  });

  it("shows a genuine failure", () => {
    expect(form).toMatch(/setOrderError\(C\.errors\.uploadFailed\)/);
  });
});
