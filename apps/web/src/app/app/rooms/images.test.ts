import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const sql = read("../../../../../../supabase/migrations/20260819001300_a_picture_in_a_room.sql");
const purgeSql = read(
  "../../../../../../supabase/migrations/20260819001400_a_deleted_member_takes_their_pictures.sql",
);
const actions = read("./[roomId]/actions.ts");
const photos = read("../../../lib/photos.ts");
const image = read("./[roomId]/post-image.tsx");
// The room composer moved into a dialog of its own; room-forms keeps the
// comment one.
const compose = read("./[roomId]/compose.tsx");
const cron = read("../../api/cron/purge/route.ts");

/**
 * A photograph carries GPS coordinates, a device serial and the moment it was
 * taken. In a room named for a diagnosis, an anonymous post with the poster's
 * home coordinates inside it is worse than no anonymity, because it looks like
 * anonymity.
 */
describe("what the camera wrote is not what gets stored", () => {
  it("re-encodes before storing, which is what drops the metadata", () => {
    expect(photos).toMatch(/export async function processRoomImage/);
    expect(actions).toMatch(
      /await processRoomImage\(Buffer\.from\(await file\.arrayBuffer\(\)\)\)/,
    );
  });

  /** Orientation has to be applied before the EXIF holding it is discarded. */
  it("rotates first, so portrait photographs do not come out sideways", () => {
    const fn = photos.slice(photos.indexOf("export async function processRoomImage"));
    expect(fn).toMatch(/\.rotate\(\)/);
    expect(fn).not.toMatch(/withMetadata/);
  });

  /** sharp refusing to decode is also the check that it is an image at all. */
  /**
   * One string for every reason told a member nothing and told us less: the
   * first time an upload failed there was no way to know which branch refused
   * it, and it had to be guessed at from the outside.
   */
  it("says which of the three went wrong", () => {
    expect(actions).toMatch(/C\.imageTooBig/);
    expect(actions).toMatch(/C\.imageWrongType/);
    expect(actions).toMatch(/C\.imageUnreadable/);
    expect(actions).toMatch(/C\.imageUploadFailed/);
  });

  /** The one failure a member cannot act on is the one we could not see. */
  it("logs the two we cannot diagnose from a screenshot", () => {
    expect(actions).toMatch(/console\.error\("room image decode failed"/);
    expect(actions).toMatch(/console\.error\("room image upload failed"/);
  });

  it("checks the type and size before any of that", () => {
    expect(actions).toMatch(/isAcceptableUpload\(file\.type, file\.size\)/);
  });

  /**
   * The middle of the chain again.
   *
   * storeRoomImage existed, the column existed, the projections carried it and
   * the picker sent the file — and postToRoom never called the helper, so every
   * post saved its text and dropped the picture. Both ends asserted, the join
   * between them not, exactly as with the reply parent.
   */
  it("actually calls it, and stores what it returns", () => {
    const fn = actions.slice(actions.indexOf("export async function postToRoom"));
    const insert = fn.slice(0, fn.indexOf("\n}"));
    expect(insert).toMatch(/await storeRoomImage\(supabase, roomId,/);
    expect(insert).toMatch(/image_path: stored\?\.path \?\? null/);
    expect(insert).toMatch(/if \(stored && "error" in stored\) return \{ error: stored\.error \}/);
  });

  /** Next caps a Server Action body, and a photograph clears that cap easily. */
  it("is allowed through the framework's own limit", () => {
    const config = read("../../../../next.config.ts");
    expect(config).toMatch(/bodySizeLimit: 8 \* 1024 \* 1024/);
  });
});

/**
 * The whole projection in room_feed exists to keep an anonymous post's author
 * out of the client. A storage key would have walked around it.
 */
describe("the path names the room, never the author", () => {
  it("builds it from the room and a fresh id", () => {
    expect(actions).toMatch(/`\$\{roomId\}\/\$\{randomUUID\(\)\}\.webp`/);
    const fn = actions.slice(actions.indexOf("async function storeRoomImage"));
    expect(fn.slice(0, fn.indexOf("\n}"))).not.toMatch(/auth\.user\.id|user_id/);
  });

  it("says so on the column, where the next person will look", () => {
    expect(sql).toMatch(/Never contains the author id/);
  });

  /** Membership decides who may see it, expressed in the path itself. */
  it("scopes the bucket policies to the room in the path", () => {
    expect(sql).toMatch(
      /bucket_id = 'room-images'\s*\n\s*and public\.i_am_in_room\(\(\(storage\.foldername\(name\)\)\[1\]\)::uuid\)/,
    );
  });

  it("keeps the bucket private", () => {
    expect(sql).toMatch(/'room-images',\s*\n\s*'room-images',\s*\n\s*false,/);
  });
});

describe("reading one back", () => {
  /** A public path would be a permanent public link to it. */
  it("mints a short-lived signed URL per render", () => {
    expect(image).toMatch(/createSignedUrl\(path, 60 \* 10\)/);
  });

  /**
   * The optimiser caches by URL, and these bytes are reachable only by a member
   * of that room — so the first viewer would populate an entry anybody could
   * then read from the CDN.
   */
  /**
   * Stronger than it was. This asserted `unoptimized` on a next/image; the
   * lightbox renders a plain <img>, so there is no optimiser in the path to
   * opt out of.
   */
  it("never goes near the image optimiser", () => {
    const lb = read("./[roomId]/image-lightbox.tsx");
    for (const [name, source] of [
      ["post-image", image],
      ["lightbox", lb],
    ] as const) {
      expect(source, `${name} must not use next/image`).not.toMatch(/from "next\/image"/);
    }
  });

  /** Inventing a description would be a guess presented as a fact. */
  it("does not invent alt text", () => {
    expect(image).toMatch(/alt=\{C\.postImageAlt\}/);
  });
});

describe("a picture is enough on its own", () => {
  it("lets a post carry no words", () => {
    expect(sql).toMatch(/char_length\(btrim\(body\)\) > 0 or image_path is not null/);
    expect(actions).toMatch(/if \(!body && !\(file instanceof File && file\.size > 0\)\)/);
  });

  /** checkTone on "" is a rule about a string nobody wrote. */
  it("only checks the tone of words that exist", () => {
    expect(actions).toMatch(/if \(body\) \{\s*\n\s*const result = tone\.checkTone/);
  });

  /**
   * Seen before it is sent, which is the reason this is a dialog at all: a
   * member attaching a photograph to a post about their diagnosis should see
   * exactly what they are about to share.
   */
  it("previews it, and lets it be taken off", () => {
    expect(compose).toMatch(/C\.postImageLabel/);
    expect(compose).toMatch(/C\.postImageRemove/);
    expect(compose).toMatch(/URL\.createObjectURL\(file\)/);
    expect(compose).toMatch(/picker\.current\.value = ""/);
  });

  /**
   * The browser holds the file alive until told otherwise, so a member trying
   * three photographs would leave three in memory.
   */
  it("revokes the object URL rather than leaking it", () => {
    expect(compose.match(/URL\.revokeObjectURL/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

/**
 * The path is keyed on the room so an anonymous post cannot be traced to its
 * author — which also means there is no user-id folder to list. The row holding
 * the path is the only index, and the cascade removes it.
 */
describe("a deleted member takes their pictures", () => {
  it("reads the paths before the cascade destroys them", () => {
    expect(purgeSql).toMatch(/room_image_paths text\[\]/);
    expect(purgeSql).toMatch(/from public\.room_messages r\s*\n\s*where r\.user_id = due\.user_id/);
  });

  it("removes them from the bucket", () => {
    expect(cron).toMatch(/from\("room-images"\)\.remove\(roomImages\)/);
  });

  /** An orphaned object is a file that should not exist; nobody finds out
   *  unless the job says so. */
  it("reports a failure rather than swallowing it", () => {
    expect(cron).toMatch(/orphaned\.push\(`room-images\/\$\{userId\}`\)/);
  });
});

/**
 * The server resizes to 1600px anyway, so sending a 12MB camera original was
 * carrying it across a phone connection to have it thrown away at the other
 * end — which is most of the wait between pressing Post and the post
 * appearing. onboarding/photos-form has done this since it was built.
 */
describe("the photograph is shrunk before it is sent", () => {
  it("downscales in the browser first", () => {
    expect(compose).toMatch(/formData\.set\("image", \(await downscalePhoto\(file\)\)\.file\)/);
  });

  /** An optimisation, not a trust boundary: the server still does all of it. */
  it("changes nothing the server checks", () => {
    expect(actions).toMatch(/isAcceptableUpload\(file\.type, file\.size\)/);
    expect(actions).toMatch(/processRoomImage/);
  });

  /**
   * `pending` is false while the shrink runs, because the action has not been
   * dispatched yet — so without this the button stays live through the slowest
   * part of posting a photograph, which is the part that looks broken.
   */
  it("disables the button through the shrink as well", () => {
    expect(compose).toMatch(/disabled=\{pending \|\| preparing\}/);
  });
});

/**
 * Two things that repaint the whole viewport, stacked.
 *
 * Not reproduced here — this records what was changed and why, so the next
 * person does not undo it looking for the same flicker.
 */
describe("less repainting behind an open dialog", () => {
  const css = read("../../../styles/globals.css");
  const modal = read("../../modal.tsx");

  /**
   * Animating a backdrop-filter means the browser re-samples everything behind
   * the backdrop and re-blurs it on every frame of the fade — 300ms, full
   * viewport, on a phone. Dropped frames under a fade read as a flicker.
   */
  it("fades the backdrop without animating the blur", () => {
    const rule = css.slice(css.indexOf("dialog::backdrop {"));
    const body = rule.slice(0, rule.indexOf("}"));
    expect(body).toMatch(/backdrop-filter: blur\(3px\)/);
    expect(body).not.toMatch(/transition:[\s\S]*?backdrop-filter/);
  });

  /** The list said "everything", and ::backdrop is not `*`, ::before or ::after. */
  it("stops the backdrop for a member who asked for no motion", () => {
    expect(css).toMatch(/\*::backdrop \{/);
  });

  /**
   * Left mounted, a form kept whatever was in it — the composer reopened
   * showing the photograph that had just been posted, because neither the
   * preview state nor the file input's value had any reason to have changed.
   */
  /**
   * showModal() in the handler and setOpen() beside it was two sources of
   * truth: the DOM knew whether the dialog was showing and the component knew
   * separately, and they only agreed as long as nothing re-rendered between
   * them.
   */
  it("drives the dialog from state, not from the handler", () => {
    expect(modal).toMatch(/if \(open && !el\.open\) el\.showModal\(\)/);
    expect(modal).toMatch(/if \(!open && el\.open\) el\.close\(\)/);
    expect(modal).toMatch(/onClose=\{\(\) => setOpen\(false\)\}/);
    const handler = modal.slice(modal.indexOf("<button"), modal.indexOf("<dialog"));
    expect(handler).not.toMatch(/showModal/);
  });

  /**
   * Left mounted forever, a form kept whatever was in it. Unmounted on close,
   * it emptied the panel mid-fade — a flicker at the end of every dismissal.
   * A key on the opening does both: fresh every time it opens, and present the
   * whole way out.
   */
  it("keys the contents on the opening rather than mounting them on it", () => {
    expect(modal).toMatch(/<Fragment key=\{opening\}>/);
    expect(modal).toMatch(/setOpening\(\(n\) => n \+ 1\)/);
  });

  /**
   * Closing is not the same as emptying.
   *
   * Unmounting the contents is what discards the component's state, and that
   * happens a render after the dialog's close event — so the first reopen
   * after a post still showed the photograph that had just been sent, and only
   * the one after that was clean. The form clears itself, which does not race
   * with anything.
   */
  /**
   * Watching `pending` go true then false with no error looked like success and
   * was not: ROOM_INITIAL is also {error: null}, so "no error" is true before
   * anything is sent, and seeing the transition at all depends on React
   * rendering both halves of it. Batched, the composer never noticed — so the
   * dialog stayed open with the photograph in it and the next render put it
   * back on screen.
   */
  it("watches a value that changes, not a sequence it infers", () => {
    const effect = compose.slice(compose.indexOf("if (!state.posted) return;"));
    const body = effect.slice(0, effect.indexOf("}, [state.posted"));
    expect(body).toMatch(/form\.current\?\.reset\(\)/);
    expect(body).toMatch(/clearImage\(\)/);
    expect(body).toMatch(/onPosted\(\)/);
    expect(compose).not.toMatch(/sent\.current/);
  });

  /** And the action supplies it. */
  it("stamps the post so the composer can see it happened", () => {
    const fn = actions.slice(
      actions.indexOf("export async function postToRoom"),
      actions.indexOf("export async function toggleLike"),
    );
    expect(fn).toMatch(/return \{ error: null, posted: Date\.now\(\) \}/);
    const state = read("./[roomId]/state.ts");
    expect(state).toMatch(/readonly posted\?: number/);
  });

  /** reset() takes the textarea, the file input and the checkbox together. */
  it("resets through the form rather than field by field", () => {
    expect(compose).toMatch(/<form\s+ref=\{form\}/);
  });

  /** backdrop-filter re-samples everything behind it, then blurs it away. */
  it("takes the grain off while a dialog is open", () => {
    expect(css).toMatch(/html:has\(dialog\[open\]\) body::before \{\s*display: none;/);
  });

  /**
   * autoFocus raised the keyboard the instant the dialog opened, which resizes
   * the visual viewport — and 100dvh plus a fixed overlay re-lay out every
   * time. Reaching for the picker dismissed it and returning raised it again.
   */
  it("does not raise the keyboard on open", () => {
    const code = compose
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*)/.test(line))
      .join("\n");
    expect(code).not.toMatch(/autoFocus/);
  });
});

/**
 * max-h with no height meant the figure was nothing until the blob decoded and
 * then jumped to whatever the photograph was — the dialog resized under it, and
 * that jump is the flicker on attaching.
 */
describe("attaching a photograph does not resize the dialog", () => {
  it("gives the preview a height before the image has one", () => {
    expect(compose).toMatch(/h-\[320px\] w-full rounded-xl border border-line-2 bg-surface-2/);
    expect(compose).not.toMatch(/max-h-\[320px\]/);
  });

  /** The path never reaches the browser, only a link that expires. */
  it("mints the signed URL on the server and hands over the link", () => {
    expect(image).toMatch(/createSignedUrl\(path, 60 \* 10\)/);
    expect(image).toMatch(/<ImageLightbox src=\{data\.signedUrl\}/);
  });
});
