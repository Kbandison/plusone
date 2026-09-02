import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const MIGRATIONS = new URL("../../../../../../../supabase/migrations/", import.meta.url);
const sql = readdirSync(fileURLToPath(MIGRATIONS))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(fileURLToPath(new URL(f, MIGRATIONS)), "utf8"))
  .join("\n");

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

/** Prose stripped: a migration must not satisfy a grant assertion by explaining itself. */
const code = sql.replace(/--[^\n]*/g, "");

const fn = /create or replace function public\.unsend_message[\s\S]*?\$\$;/.exec(code)?.[0] ?? "";
const page = read("./page.tsx");

/** Block and line comments out, so prose cannot satisfy or break an assertion. */
const noComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

describe("unsending redacts, and moderation keeps what it needs", () => {
  it("finds the function at all", () => {
    // The floor under every assertion in this block.
    expect(fn.length).toBeGreaterThan(400);
  });

  it("never deletes the row", () => {
    // reports.reported_message_id is `on delete set null`, so deleting a
    // message does not remove a report — it removes the EVIDENCE from one, and
    // a moderator opens an accusation with nothing attached. "Send it, get
    // reported, delete it" must not be a way out.
    expect(fn).not.toMatch(/delete\s+from\s+public\.messages/);
    expect(fn).toMatch(/update public\.messages/);
    expect(fn).toMatch(/set deleted_at = now\(\)/);
  });

  it("moves the content out of the row rather than hiding it in place", () => {
    // Stronger than a view that nulls a column on read: what a member can query
    // does not contain it, whatever they ask for.
    expect(fn).toMatch(/insert into public\.message_redactions/);
    for (const col of ["body", "image_path", "voice_note_path", "voice_note_seconds"]) {
      expect(fn, `${col} is left in the row`).toMatch(new RegExp(`${col} = null`));
    }
  });

  it("keeps the redaction table readable by nobody", () => {
    // The second table in this schema granted to no role — waitlist is the
    // other. There is no member who should read it: not the sender, who chose
    // to withdraw it, and not the recipient, for whom the point is that it is
    // gone. A policy here would be the wrong instinct.
    expect(code).toMatch(/revoke all on public\.message_redactions from anon, authenticated/);
    expect(code).toMatch(/alter table public\.message_redactions\s+force row level security/);
    expect(code).not.toMatch(/create policy[^;]*on public\.message_redactions/);
  });

  it("relaxes the content constraint only for redacted rows", () => {
    // An emptied row legitimately has no content and the constraint predates
    // the idea — but an ORDINARY message must still carry one of the three, or
    // an empty send becomes possible.
    const constraint =
      /add constraint messages_has_content check \([\s\S]*?\);/g.exec(
        code.slice(code.lastIndexOf("messages_has_content")! - 400),
      )?.[0] ?? code;
    expect(constraint).toMatch(/deleted_at is not null/);
    expect(constraint).toMatch(/char_length\(body\) between 1 and 4000/);
    expect(constraint).toMatch(/voice_note_path is not null/);
    expect(constraint).toMatch(/image_path is not null/);
  });
});

describe("only the sender, and only while it is still a conversation", () => {
  it("refuses anybody but the sender", () => {
    // Not "a participant". The other person withdrawing your words is a
    // different feature and not one anybody asked for.
    expect(fn).toMatch(/sender_id <> v_uid/);
  });

  it("gives the same answer for not-yours and not-found", () => {
    // Otherwise this is an oracle for whether a message id exists.
    expect(fn).toMatch(/v_msg\.id is null or v_msg\.sender_id <> v_uid/);
  });

  it("refuses once the chat has ended", () => {
    // §3.5 gives the closure note the last word. Editing what it was a response
    // to, afterwards, changes a record rather than a conversation.
    expect(fn).toMatch(/v_status is distinct from 'open'/);
    expect(fn).toMatch(/v_status is distinct from 'date_planned'/);
  });

  it("treats an already-unsent message as done, not as an error", () => {
    // The button can be pressed twice on a slow connection, and the second
    // press is not a mistake worth a message.
    expect(fn).toMatch(/if v_msg\.deleted_at is not null then\s+return;/);
  });

  it("runs as definer, since the redaction table is granted to nobody", () => {
    expect(fn).toMatch(/security definer/);
  });
});

describe("what the other person sees", () => {
  it("leaves a marker rather than a gap", () => {
    // A message that simply vanishes is a gaslighting vector: the recipient
    // remembers something that is no longer there and has nothing to point at.
    // And the row is what a report references, so a silent disappearance takes
    // away the ability to REPORT it as well as the evidence.
    expect(page).toMatch(/isRedacted\(message\) \?/);
    expect(page).toMatch(/unsendTombstoneMine/);
    expect(page).toMatch(/unsendTombstoneTheirs/);
  });

  it("shows the sender a marker too", () => {
    // Only showing it to the recipient would let a sender believe it had gone
    // without trace.
    const branch = /isRedacted\(message\) \? \([\s\S]*?<\/li>/.exec(page)?.[0] ?? "";
    expect(branch.length).toBeGreaterThan(80);
    expect(branch).toMatch(/mine \? C\.unsendTombstoneMine : C\.unsendTombstoneTheirs/);
  });

  it("never claims the message was deleted", () => {
    // The content is retained for moderation, so a claim of deletion would be
    // false — and this product makes one real claim of deletion, in the
    // account-deletion copy that says "we mean actually deleted". That is the
    // standard this must not undercut.
    const copy = readFileSync(
      fileURLToPath(
        new URL("../../../../../../../packages/config/src/draft-copy.ts", import.meta.url),
      ),
      "utf8",
    );
    const block = /unsendTombstoneMine:[\s\S]*?unsendFailed:[^\n]*/.exec(copy)?.[0] ?? "";
    expect(block.length).toBeGreaterThan(50);
    expect(block).not.toMatch(/delet/i);
  });
});

describe("it survives the deploy order", () => {
  it("names no column a live schema might not have", () => {
    // The first version fetched the deleted ids separately, which needed
    // deploy-order care because PostgREST fails the WHOLE request on an unknown
    // column — one line would have rendered the chat with NO MESSAGES. Deriving
    // it from the row removes the column reference and the care with it.
    // Comments stripped first. Both files EXPLAIN why they no longer name the
    // column, and matching the prose that says so is how this assertion failed
    // on the correct code — the same shape the migration scans in this repo
    // strip for, one language over.
    expect(noComments(page)).not.toMatch(/deleted_at/);
    expect(noComments(read("../../inbox/page.tsx"))).not.toMatch(/deleted_at/);
  });

  it("derives redaction from the row, which the constraint guarantees", () => {
    // messages_has_content allows a row with no body, no voice note and no
    // image ONLY when deleted_at is set, so the absence IS the marker and the
    // database enforces the equivalence. A separately-fetched set of ids can
    // disagree with the rows it describes; this cannot.
    expect(page).toMatch(/!message\.body && !message\.image_path && !message\.voice_note_path/);
  });

  it("asks the same question in the inbox, on all three kinds", () => {
    // Missing image_path here would file every image-only message as redacted.
    const inbox = read("../../inbox/page.tsx");
    expect(inbox).toMatch(/!row\["body"\]/);
    expect(inbox).toMatch(/!row\["voice_note_path"\]/);
    expect(inbox).toMatch(/!row\["image_path"\]/);
    expect(inbox).toMatch(/image_path/);
    expect(inbox).toMatch(/wasUnsent\s*\?\s*C\.unsendTombstoneTheirs/);
  });
});
