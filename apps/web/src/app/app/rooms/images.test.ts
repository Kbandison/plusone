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
const forms = read("./[roomId]/room-forms.tsx");
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
  it("never goes through the image optimiser", () => {
    expect(image).toMatch(/unoptimized/);
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

  it("shows what is attached, and lets it be taken off", () => {
    expect(forms).toMatch(/C\.postImageLabel/);
    expect(forms).toMatch(/C\.postImageRemove/);
    expect(forms).toMatch(/picker\.current\.value = ""/);
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
