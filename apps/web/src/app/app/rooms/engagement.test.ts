import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const sql = read(
  "../../../../../../supabase/migrations/20260819000800_replies_likes_and_who_saw_it.sql",
);
const row = read("./[roomId]/post-row.tsx");
const feed = read("./[roomId]/page.tsx");
const thread = read("./[roomId]/[post]/page.tsx");
const forms = read("./[roomId]/room-forms.tsx");
const like = read("./[roomId]/like-button.tsx");

/**
 * Decision #26 puts ghosting penalties out and rules out public response rates
 * and shame mechanics. A downvote counter under somebody's diagnosis story is
 * the exact mechanic it exists to prevent. Kevin's call, having been asked.
 */
describe("there is no dislike", () => {
  /**
   * Code, not prose. The migration explains at length why there is no dislike,
   * and a naive scan for the word failed on the explanation — which would have
   * left the only way to pass being to stop writing down the reason.
   */
  const withoutComments = (source: string) =>
    source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !/^\s*(--|\/\/|\*)/.test(line))
      .join("\n");

  it("has no counterpart anywhere in the schema or the UI", () => {
    for (const [name, source] of [
      ["migration", sql],
      ["post row", row],
      ["like button", like],
    ] as const) {
      expect(withoutComments(source), `${name} must not carry a dislike`).not.toMatch(
        /dislike|downvote/i,
      );
    }
  });

  /** And the reason stays written down, which is the half that survives. */
  it("records why, where the next person will look", () => {
    expect(sql).toMatch(/Decision #26/);
  });
});

/**
 * A comment is a post with a parent. Everything a post already gets — the alias
 * trigger, the anonymity projection, the tone check, the block wall — applies
 * to a comment for free, and none of it has to be remembered twice.
 */
describe("comments are posts", () => {
  it("adds a parent rather than a second table", () => {
    expect(sql).toMatch(/add column if not exists parent_id uuid references public\.room_messages/);
    expect(sql).not.toMatch(/create table public\.room_comments/);
  });

  /** "The UI never sends it" is not a constraint. */
  it("refuses a reply to a reply in the database", () => {
    expect(sql).toMatch(/a reply cannot be replied to/);
    expect(sql).toMatch(/create trigger room_messages_flat/);
  });

  /** A comment cannot be filed under a room its post is not in. */
  it("takes the room from the parent, not from the client", () => {
    expect(sql).toMatch(/new\.room_id := v_parent_room;/);
  });

  it("keeps comments out of the feed and under their post", () => {
    expect(sql).toMatch(/and m\.parent_id is null/);
    expect(sql).toMatch(/where \(m\.id = p_message_id or m\.parent_id = p_message_id\)/);
  });

  /**
   * A member who posted anonymously and then replied under their own name
   * would have undone their own cover in the place it matters most.
   */
  it("offers the anonymity choice on a comment too", () => {
    const composer = forms.slice(forms.indexOf("export function CommentComposer"));
    expect(composer).toMatch(/name="anonymous"/);
  });

  /** A reply cannot be replied to, so nothing offers it. */
  it("gives a comment no comment link", () => {
    expect(thread).toMatch(/<PostRow\s+post=\{comment\}[\s\S]{0,200}\/>/);
    const commentRender = thread.slice(thread.indexOf("post={comment}"));
    expect(commentRender.slice(0, 200)).not.toMatch(/commentHref/);
  });
});

describe("who liked is never exposed", () => {
  /** A list of likers on an anonymous thread is the anonymity by the side door. */
  it("limits a member to their own row", () => {
    const policy = sql.slice(sql.indexOf('create policy "own likes in your own rooms"'));
    expect(policy.slice(0, policy.indexOf(";"))).toMatch(/user_id = \(select auth\.uid\(\)\)/);
  });

  it("takes the count from the aggregate instead", () => {
    expect(sql).toMatch(/select count\(\*\) from public\.room_likes l where l\.message_id = m\.id/);
  });

  /** Otherwise any guessed id becomes an oracle for which posts exist. */
  it("only likes a post the caller can see", () => {
    const fn = sql.slice(sql.indexOf("create or replace function public.toggle_room_like"));
    expect(fn).toMatch(/public\.i_am_in_room\(m\.room_id\)/);
    expect(fn).toMatch(/not public\.i_am_blocked_with\(m\.user_id\)/);
  });

  it("revokes the default grants Supabase hands out", () => {
    expect(sql).toMatch(/revoke all on public\.room_likes from anon, authenticated/);
    expect(sql).toMatch(/revoke all on public\.room_post_views from anon, authenticated/);
  });
});

/**
 * "2 views" under somebody's diagnosis story reads worse than no number at all.
 * The question a member has is whether anyone saw it, and their own count
 * answers it without publishing a small number to the room.
 */
describe("views are the author's alone", () => {
  it("returns null to everybody else", () => {
    expect(sql).toMatch(
      /when m\.user_id = \(select auth\.uid\(\)\)\s*\n\s*then \(select count\(\*\) from public\.room_post_views/,
    );
  });

  /** A table nobody can select cannot be joined into a list of who read what. */
  it("is write-only to a client", () => {
    expect(sql).toMatch(/grant insert on public\.room_post_views to authenticated/);
    expect(sql).not.toMatch(/grant select[^;]*room_post_views/);
  });

  /** A count that grows on every re-render measures scrolling, not people. */
  it("counts a person once", () => {
    expect(sql).toMatch(/primary key \(message_id, user_id\)/);
    expect(sql).toMatch(/on conflict do nothing/);
  });

  it("records what was actually shown, once per page", () => {
    expect(feed).toMatch(/record_room_views", \{ p_message_ids: posts\.map/);
    expect(row).toMatch(/post\.view_count !== null/);
  });

  /** A comment was on screen because the post was. */
  it("does not count comments as views of themselves", () => {
    expect(thread).toMatch(/p_message_ids: \[root\.id\]/);
  });
});

describe("the like reads as instant", () => {
  /** React reverts an optimistic value if the action throws. */
  it("is optimistic, and corrects itself", () => {
    expect(like).toMatch(/useOptimistic/);
    expect(like).toMatch(/aria-pressed=\{state\.liked\}/);
  });

  /** A returned error would be a second way to say what the revert already says. */
  it("throws rather than returning an error the button would double up", () => {
    const action = read("./[roomId]/actions.ts");
    const fn = action.slice(action.indexOf("export async function toggleLike"));
    expect(fn.slice(0, fn.indexOf("\n}"))).toMatch(/throw new Error/);
  });

  /** So the row does not shift a pixel when 9 becomes 10. */
  it("uses tabular figures for the count", () => {
    expect(like).toMatch(/tabular-nums/);
  });
});

/**
 * A post that looks like one thing in a list and another when opened is two
 * designs to keep in step.
 */
describe("one row, two screens", () => {
  it("renders both through the same component", () => {
    expect(feed).toMatch(/<PostRow/);
    expect(thread).toMatch(/<PostRow/);
  });

  it("takes both from the same projection", () => {
    expect(feed).toMatch(/rpc\("room_feed"/);
    expect(thread).toMatch(/rpc\("room_thread"/);
    expect(sql).toMatch(/room_thread\(uuid\) is[\s\S]{0,140}same projection room_feed uses/);
  });
});
