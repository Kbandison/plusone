import { describe, expect, it } from "vitest";

import { FEEDBACK_CONTEXT_NOTE } from "./feedback";

/**
 * What the member is told we collect, against what we collect.
 *
 * ── this was guarded by nothing until 2026-09-20 ────────────────────────────
 *
 * The note is shown before they send, deliberately, "and the surest way to make
 * that true is to let them read it". But nothing held the sentence to the
 * payload: a fourth field added to `feedback` would have left this claiming
 * three, and the member reading it would have been misled by a string nobody
 * remembered to change.
 *
 * Found while cutting the sentence's tail — Kevin removed "Nothing else — no
 * message, no profile…", which is the kind of edit that could quietly have
 * taken a real claim with it.
 *
 * The table's own columns are the other half of the pair and are checked by
 * `feedback.test.ts` in apps/web; this holds the SENTENCE to the three context
 * facts, which are the only ones a member could not otherwise see. `body` and
 * `kind` are what they typed and chose, `user_id` is the account it is sent
 * from, and the rest is our own bookkeeping.
 */
describe("the note matches what is actually sent", () => {
  const note = FEEDBACK_CONTEXT_NOTE.toLowerCase();

  it("names all three context facts", () => {
    // feedback.surface, feedback.page, feedback.app_version.
    expect(note, "page").toMatch(/which screen/);
    expect(note, "app_version").toMatch(/which version/);
    expect(note, "surface").toMatch(/browser or an installed app/);
  });

  it("claims nothing beyond them", () => {
    // The tail said "Nothing else — no message, no profile, and nothing about
    // who you are beyond the account this is sent from." Cut as over-explaining:
    // the three facts are listed immediately above and a member can count them.
    // What must not come back is a CLAIM this file cannot keep.
    expect(note).not.toMatch(/nothing else/);
    expect(note).not.toMatch(/no profile|anonymous|we cannot see/);
  });

  it("is one sentence", () => {
    // The same standard the beta checklist and the support-only warning are
    // held to. It has now grown a second sentence twice.
    expect(FEEDBACK_CONTEXT_NOTE.split(/(?<=[.?])\s+/).length).toBe(1);
  });
});
