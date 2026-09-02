import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

/** Assertions read code, not the prose around it. */
const withoutComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(--|\/\/|\*)/.test(line))
    .join("\n");

const actions = withoutComments(read("./actions.ts"));
const forms = withoutComments(read("./chat-forms.tsx"));
const page = withoutComments(read("./page.tsx"));
const image = withoutComments(read("./chat-image.tsx"));
const lightbox = read("../../rooms/[roomId]/image-lightbox.tsx");
const sql = read("../../../../../../../supabase/migrations/20260821000100_a_photo_in_a_chat.sql");

/**
 * The rooms have had photographs and a chat has not, which is backwards from
 * where it matters: a room post with a picture is a contribution, and a picture
 * sent to one person mid-conversation is most of what people mean by talking.
 */
describe("a chat carries a photograph", () => {
  it("has somewhere to put one", () => {
    expect(sql).toMatch(/alter table public\.messages add column if not exists image_path text/);
    expect(page).toMatch(/\.select\("id, sender_id, body, image_path, voice_note_path/);
  });

  /** A picture with no words is a message. */
  it("lets the constraint accept an image with no body", () => {
    const check = sql.slice(sql.indexOf("add constraint messages_has_content"));
    expect(check.slice(0, check.indexOf(");"))).toMatch(/or image_path is not null/);
    expect(actions).toMatch(/if \(!body && !image\) return \{ error: null \}/);
    // An empty string is not null, and the constraint counts characters on
    // anything non-null.
    expect(actions).toMatch(/body: body \|\| null/);
  });

  /**
   * Members hold `select, insert` on messages and nothing else, because §5.2
   * makes them immutable — so there is no second write available to fill in a
   * path afterwards. sendVoiceNote learned this the expensive way and every
   * note in the database pointed at 'pending'.
   */
  it("uploads under the id the row will be given, then inserts once", () => {
    const send = actions.slice(actions.indexOf("export async function sendMessage"));
    const body = send.slice(0, send.indexOf("export async function sendVoiceNote"));
    expect(body).toMatch(/const messageId = crypto\.randomUUID\(\)/);
    expect(body.indexOf("chat-images")).toBeLessThan(body.indexOf('.from("messages").insert'));
    expect(body).toMatch(/id: messageId/);
    expect(body).not.toMatch(/\.update\(/);
  });

  /** A failed insert leaves an object nothing points at, which is removable. */
  it("cleans up after itself when the row does not land", () => {
    expect(actions).toMatch(
      /if \(imagePath\) await supabase\.storage\.from\("chat-images"\)\.remove\(\[imagePath\]\)/,
    );
  });

  /**
   * A photograph carries GPS coordinates, a device serial and the moment the
   * camera recorded. Somebody you have just met should not learn which building
   * you took it in.
   */
  it("re-encodes before storing, which is what drops the metadata", () => {
    expect(actions).toMatch(/processRoomImage\(Buffer\.from\(await image\.arrayBuffer\(\)\)\)/);
    expect(actions).toMatch(/contentType: "image\/webp"/);
  });

  /** Told apart, because only one of the three is something a member can act on. */
  it("says which way it failed", () => {
    for (const key of ["imageTooBig", "imageWrongType", "imageUnreadable", "imageUploadFailed"]) {
      expect(actions, key).toMatch(new RegExp(`C\\.${key}`));
    }
  });

  /** A closed chat accepts nothing further, pictures included. */
  it("treats a policy refusal on the object as a closed chat", () => {
    expect(actions).toMatch(/row-level security[\s\S]{0,160}chatClosedMidSend/);
  });
});

/**
 * Private, like every other bucket here. A public URL to a photograph sent to
 * one person is a permanent link anybody can hold.
 */
describe("only the two people in the chat can see it", () => {
  it("keys the path on the chat and the policies on participation", () => {
    expect(sql).toMatch(/'chat-images',\s*\n\s*'chat-images',\s*\n[\s\S]{0,200}false,/);
    const policies = sql.slice(sql.indexOf('create policy "participants read chat images"'));
    expect(policies).toMatch(/i_am_in_chat\(\(\(storage\.foldername\(name\)\)\[1\]\)::uuid\)/);
    expect(sql).toMatch(/chat_accepts_messages\(\(\(storage\.foldername\(name\)\)\[1\]\)::uuid\)/);
    expect(actions).toMatch(/`\$\{chatId\}\/\$\{messageId\}\.webp`/);
  });

  /**
   * Removing a REFERENCED image would leave a message rendering a broken
   * picture forever, which §5.2's immutability exists to prevent.
   */
  it("allows deleting only an image no message points at", () => {
    const del = sql.slice(sql.indexOf("participants may remove an unreferenced chat image"));
    expect(del).toMatch(/not exists \(\s*select 1 from public\.messages m where m\.image_path/);
  });

  it("serves it through a short-lived signed URL", () => {
    expect(image).toMatch(/createSignedUrl\(path, 60 \* 10\)/);
    expect(image).not.toMatch(/getPublicUrl/);
  });
});

/**
 * Storage cannot cascade, and a chat image has no user-id folder to list — the
 * row holding the path is the only index there is.
 */
describe("both purges take the pictures with them", () => {
  it("reads the paths before the rows that name them are destroyed", () => {
    expect(sql).toMatch(/chat_image_paths text\[\]/);
    expect(sql).toMatch(/image_paths text\[\]/);
  });

  it("removes them from the bucket", () => {
    const cron = read("../../../api/cron/purge/route.ts");
    expect(cron).toMatch(/from\("chat-images"\)\s*\n?\s*\.remove\(chatImages\)/);
    expect(cron).toMatch(/from\("chat-images"\)\.remove\(images\)/);
  });
});

/**
 * A picture in a chat cannot be unsent — §5.2 makes messages immutable and
 * there is no undo anywhere in this product — so the one moment a member can
 * still change their mind is between choosing the file and pressing Send.
 */
describe("the composer shows it before it goes", () => {
  it("previews rather than sending on selection", () => {
    expect(forms).toMatch(/URL\.createObjectURL\(image\)/);
    expect(forms).toMatch(/postImageRemove/);
    expect(forms).toMatch(/onClick=\{clearImage\}/);
  });

  /** A blob: URL is held by the document until it is revoked. */
  it("revokes the preview it replaces", () => {
    expect(forms).toMatch(/return \(\) => URL\.revokeObjectURL\(url\)/);
  });

  /** The server resizes to 1600px anyway; the original is carried for nothing. */
  it("shrinks it in the browser first", () => {
    expect(forms).toMatch(/downscalePhoto\(file\)/);
    expect(forms).toMatch(/disabled=\{pending \|\| preparing\}/);
  });

  it("stops requiring a body once a photograph is attached", () => {
    expect(forms).toMatch(/required=\{image === null\}/);
  });

  /**
   * On a token the action returns, not on `pending` going true and then false —
   * React can batch those two renders, and when it does the box keeps the
   * message that was just sent with the photograph still attached to it.
   */
  it("clears the picture on a send that worked, with the draft", () => {
    const cleared = forms.slice(forms.indexOf("if (!state.sent) return;"));
    expect(cleared.slice(0, 240)).toMatch(/setBody\(""\)/);
    expect(cleared.slice(0, 240)).toMatch(/setImage\(null\)/);
    expect(cleared.slice(0, 240)).toMatch(/picker\.current\.value = ""/);
  });

  /**
   * A form cannot contain another form and VoiceRecorder is one, so the button
   * beside the microphone cannot be a sibling of the input it opens. A <label
   * for> reaches an input anywhere in the document; a file control outside the
   * form it feeds is a file that never gets posted.
   */
  it("puts the button beside the microphone and the input inside the form", () => {
    expect(forms).toMatch(/htmlFor=\{pickerId\}/);
    const composer = forms.slice(forms.indexOf("export function Composer"));
    const form = composer.slice(0, composer.indexOf("export function PhotoButton"));
    expect(form).toMatch(
      /id=\{pickerId\}[\s\S]{0,80}type="file"|type="file"[\s\S]{0,80}id=\{pickerId\}/,
    );
    expect(form).toMatch(/name="image"/);

    const page = read("./page.tsx");
    expect(page).toMatch(/<PhotoButton pickerId=\{PICKER_ID\} \/>\s*\n\s*<VoiceRecorder/);
  });

  /** sr-only rather than hidden, so it stays in the tab order. */
  it("keeps the control reachable by keyboard", () => {
    const composer = forms.slice(forms.indexOf("export function Composer"));
    const input = composer.slice(composer.indexOf('type="file"'));
    expect(input.slice(0, 400)).toMatch(/className="sr-only"/);
    expect(input.slice(0, 400)).not.toMatch(/hidden|display: none/);
  });

  /** Beside the mic, and it has to look like it. */
  it("offers only the types the server will take", () => {
    expect(forms).toMatch(/accept=\{ACCEPTED_TYPES\.join\(","\)\}/);
    expect(forms).toMatch(/<PhotoIcon \/>/);
  });
});

/**
 * The full-screen half is identical in a room and in a chat, and it is the half
 * with the decisions in it — the `display` trap cost a whole tab bar once.
 */
describe("the lightbox is not written twice", () => {
  it("is the room's, with the trigger styled by the caller", () => {
    expect(image).toMatch(/from "@\/app\/app\/rooms\/\[roomId\]\/image-lightbox"/);
    expect(lightbox).toMatch(/triggerClassName = /);
    expect(lightbox).toMatch(/imageClassName = /);
    expect(lightbox).toMatch(/label = C\.postImageOpen/);
  });

  /** A button inside a button is invalid and stops working. */
  /**
   * Anchored WITHOUT the leading brace.
   *
   * It was `{message.image_path ? (`, which stopped existing the moment a
   * branch was added before it — the tombstone in 20260902000300's UI made it
   * `) : message.image_path ? (`. indexOf then returned -1 and `slice(-1)` gave
   * the last character of the file, so both assertions below were running
   * against one character rather than failing loudly.
   */
  const imageBranchAt = (src: string) => {
    const at = src.indexOf("message.image_path ? (");
    expect(at, "the image branch has moved or been renamed").toBeGreaterThan(0);
    return at;
  };

  it("keeps the picture out of a TextBubble", () => {
    const branch = page.slice(imageBranchAt(page));
    expect(branch.slice(0, branch.indexOf("</li>"))).not.toMatch(/<TextBubble/);
    expect(branch).toMatch(/<ChatImage/);
  });

  /** A caption when there was one, and nothing when there was not. */
  it("renders a body beside the image only if one was sent", () => {
    const branch = page.slice(imageBranchAt(page));
    expect(branch).toMatch(/\{message\.body \? \(/);
  });
});
