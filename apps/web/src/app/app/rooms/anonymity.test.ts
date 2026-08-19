import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const room = read("./[roomId]/page.tsx");
const row = read("./[roomId]/post-row.tsx");
const forms = read("./[roomId]/room-forms.tsx");
const actions = read("./[roomId]/actions.ts");
const safety = read("../../../lib/safety.ts");
const controls = read("../safety/safety-controls.tsx");
const sql = read(
  "../../../../../../supabase/migrations/20260819000700_a_name_you_choose_to_give.sql",
);

/**
 * Attribution means shipping something per post. The naive version ships
 * user_id and lets the client decide what to render — and a client-side
 * decision about whose name to show is not privacy, it is a stylesheet.
 */
describe("the id is not something a client can ask for", () => {
  /** A column privilege, not a policy: the column cannot be named at all. */
  it("revokes the column rather than trusting the query", () => {
    expect(sql).toMatch(/revoke select on public\.room_messages from authenticated/);
    expect(sql).toMatch(
      /grant select \(id, room_id, body, deleted_at, created_at, anonymous, author_alias\)/,
    );
  });

  /** Writing your own id into your own post is not reading anybody's. */
  it("still lets a member write their own", () => {
    expect(sql).toMatch(/grant insert \(room_id, user_id, body, anonymous\)/);
  });

  /** No branch where an anonymous author's id comes back. */
  it("projects a null author id for an anonymous post", () => {
    expect(sql).toMatch(/case when m\.anonymous then null else m\.user_id end/);
    expect(sql).toMatch(/case when m\.anonymous then m\.author_alias else p\.display_name end/);
  });

  it("reads the feed through that projection and not the table", () => {
    expect(room).toMatch(/supabase\.rpc\("room_feed"/);
    expect(room).not.toMatch(/\.from\("room_messages"\)/);
  });

  /** Re-applying the wall by calling the same predicates, not restating them. */
  it("keeps every wall the dropped policy carried", () => {
    const feed = sql.slice(sql.indexOf("create or replace function public.room_feed"));
    expect(feed).toMatch(/m\.deleted_at is null/);
    expect(feed).toMatch(/public\.i_am_in_room\(m\.room_id\)/);
    expect(feed).toMatch(/not public\.i_am_blocked_with\(m\.user_id\)/);
  });
});

/**
 * A hash of (user_id, room_id) is reversible by anybody who can guess a user
 * id, and every member can see plenty of ids.
 */
describe("the alias cannot be worked backwards", () => {
  it("is chosen at random and written down, never derived", () => {
    const fn = sql.slice(sql.indexOf("create or replace function public.assign_room_alias"));
    expect(fn).toMatch(/order by random\(\)/);
    expect(fn).not.toMatch(/md5|digest|hmac|encode\(/);
  });

  /** A member who posts twice in a thread is the same person in it. */
  it("stays the same for one member in one room", () => {
    const fn = sql.slice(sql.indexOf("create or replace function public.assign_room_alias"));
    expect(fn).toMatch(/where m\.room_id = new\.room_id\s*\n\s*and m\.user_id = new\.user_id/);
  });

  /**
   * Per room, which is what stops a story in one being lined up with a remark
   * in another and then with a profile. That correlation is the actual attack.
   */
  it("is scoped to the room, so nothing links across them", () => {
    expect(sql).toMatch(/Stable per \(room, author\) pseudonym/);
  });

  /** Two members sharing one alias would read as one person contradicting themselves. */
  it("does not hand out a name already in use in that room", () => {
    const fn = sql.slice(sql.indexOf("create or replace function public.assign_room_alias"));
    expect(fn).toMatch(/where not \(w = any \(v_taken\)\)/);
  });

  /** Ugly and reachable beats silently reusing a word. */
  it("has somewhere to go when the words run out", () => {
    expect(sql).toMatch(/'Member ' \|\| \(coalesce\(array_length\(v_taken, 1\), 0\) \+ 1\)/);
  });

  it("is never accepted from a client", () => {
    expect(sql).not.toMatch(/grant insert[^;]*author_alias/);
  });
});

describe("what a member sees and chooses", () => {
  it("offers the choice per post, off by default", () => {
    expect(forms).toMatch(/type="checkbox"\s+name="anonymous"/);
    expect(forms).not.toMatch(/name="anonymous"[\s\S]{0,120}defaultChecked/);
    expect(actions).toMatch(/formData\.get\("anonymous"\) === "on"/);
  });

  /** A pseudonym that does not announce itself is taken for a real name. */
  it("says a post is anonymous next to the name", () => {
    expect(row).toMatch(/post\.anonymous \?/);
    expect(row).toMatch(/C\.postAnonymous\b/);
  });

  /** The same neutral shape a member with no photo gets, not a second symbol. */
  it("shows no photo for an anonymous author", () => {
    expect(room).toMatch(
      /photo=\{post\.author_id \? authorPhotos\.get\(post\.author_id\) : undefined\}/,
    );
  });

  /** Attribution is a choice about a name, not a waiver of everything else. */
  it("still honours photo privacy for a named author", () => {
    expect(room).toMatch(/photosFor\(/);
  });
});

describe("safety still reaches an author nobody can see", () => {
  /**
   * The old resolve selected user_id with the caller's own privileges under a
   * comment reading "the id never leaves the server" — true of the code and not
   * of the privilege that allowed it. With the column revoked it would have
   * silently blocked nobody.
   */
  it("blocks through the RPC rather than a select", () => {
    expect(safety).toMatch(/rpc\("block_room_message_author"/);
    expect(safety).not.toMatch(/\.from\("room_messages"\)\s*\n\s*\.select\("user_id"\)/);
  });

  /** Otherwise any guessed id becomes an oracle for "does this post exist". */
  it("only resolves a post the caller can see", () => {
    const fn = sql.slice(
      sql.indexOf("create or replace function public.block_room_message_author"),
    );
    expect(fn).toMatch(/public\.i_am_in_room\(m\.room_id\)/);
    expect(fn).toMatch(/m\.deleted_at is null/);
  });

  /**
   * "Block them as well" was gated on memberId, which a room report never has
   * by design — so the one surface where a member most wants both at once
   * offered only the report.
   */
  it("offers block-too on a room report, and makes it work", () => {
    expect(controls).toMatch(/\{memberId \|\| roomMessageId \?/);
    expect(safety).toMatch(/!reportedUserId && reportedRoomMessageId/);
  });
});
