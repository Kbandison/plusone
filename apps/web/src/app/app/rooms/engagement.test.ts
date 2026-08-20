import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const sql = read(
  "../../../../../../supabase/migrations/20260819000800_replies_likes_and_who_saw_it.sql",
);
const row = read("./[roomId]/post-row.tsx");
const thread = read("./[roomId]/thread.tsx");
const threadPage = read("./[roomId]/[post]/page.tsx");
const threadModal = read("./[roomId]/@modal/(.)[post]/page.tsx");
const routeModal = read("../../route-modal.tsx");
const forms = read("./[roomId]/room-forms.tsx");
const like = read("./[roomId]/like-button.tsx");

/**
 * Decision #26 puts ghosting penalties out and rules out public response rates
 * and shame mechanics. A downvote counter under somebody's diagnosis story is
 * the exact mechanic it exists to prevent. Kevin's call, having been asked.
 */
/**
 * Code, not prose.
 *
 * These files explain at length why a thing was removed, and a naive scan for
 * the word fails on the explanation — which would leave the only way to pass
 * being to stop writing down the reason.
 */
const withoutComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(--|\/\/|\*)/.test(line))
    .join("\n");

describe("there is no dislike", () => {
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

  it("keeps comments out of the roomPage and under their post", () => {
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
    const commentRender = thread.slice(
      thread.indexOf("post={comment}"),
      thread.indexOf("post={comment}") + 300,
    );
    expect(commentRender).toMatch(/variant="comment"/);
    expect(commentRender).not.toMatch(/commentHref/);
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
    expect(roomPage).toMatch(/record_room_views"[\s\S]{0,80}posts\.map\(\(post\) => post\.id\)/);
    expect(row).toMatch(/post\.view_count !== null/);
  });

  /** A comment was on screen because the post was. */
  it("does not count comments as views of themselves", () => {
    expect(thread).toMatch(/p_message_ids: \[root\.id\]/);
  });
});

describe("the like reads as instant, and stays right", () => {
  /**
   * useOptimistic DISCARDS its value when the transition ends and falls back to
   * the props it was given. Nothing revalidated the roomPage, so those props still
   * said what the server had said before the press — like, see 1, press again,
   * see 0, watch it come back to 1. The optimistic value was correct and the
   * stale prop won.
   */
  it("takes the count from the server rather than guessing", () => {
    const migration = read(
      "../../../../../../supabase/migrations/20260819000900_a_like_that_answers_and_a_reply_that_does_not_wait.sql",
    );
    expect(migration).toMatch(/returns table \(liked boolean, like_count integer\)/);
    expect(like).toMatch(/setView\(actual \?\? fromServer\)/);
    // Code, not the comment explaining why it is gone.
    expect(withoutComments(like)).not.toMatch(/useOptimistic/);
  });

  /** A fresh render from the server has to win over a stale local value. */
  it("lets new props overtake local state", () => {
    expect(like).toMatch(/if \(fromServer\.liked !== liked \|\| fromServer\.count !== count\)/);
  });

  /**
   * Re-rendering a hundred-post roomPage to learn one number the RPC already
   * returned is a lot of work for the control a member presses most.
   */
  it("does not revalidate the whole roomPage for one number", () => {
    const action = read("./[roomId]/actions.ts");
    const fn = action.slice(action.indexOf("export async function toggleLike"));
    expect(fn.slice(0, fn.indexOf("\n}"))).not.toMatch(/revalidatePath/);
  });

  it("says pressed, and how many, to a reader", () => {
    expect(like).toMatch(/aria-pressed=\{view\.liked\}/);
    expect(like).toMatch(/C\.postLikeCount\(view\.count\)/);
  });

  /** So the row does not shift a pixel when 9 becomes 10. */
  it("uses tabular figures for the count", () => {
    expect(like).toMatch(/tabular-nums/);
  });
});

/**
 * Kevin, 2026-08-19: "i wouldn't want someone replying to someone else to get
 * throttled." Slow mode exists so one member cannot fill a room; answering
 * somebody is the thing the room is for.
 */
describe("a reply is not a flood", () => {
  const migration = read(
    "../../../../../../supabase/migrations/20260819000900_a_like_that_answers_and_a_reply_that_does_not_wait.sql",
  );

  it("applies the room's cooldown to top-level posts only", () => {
    expect(migration).toMatch(/if new\.parent_id is null then\s*\n\s*select r\.slow_mode_seconds/);
  });

  /** Off by default, and one app_config row away if flooding ever appears. */
  it("keeps a comment throttle available and switched off", () => {
    expect(migration).toMatch(/config_int\('rooms\.comment_slow_mode_seconds', 0\)/);
    expect(migration).toMatch(/'rooms\.comment_slow_mode_seconds', to_jsonb\(0\)/);
  });

  /** A top-level post must not silently block a reply written a moment later. */
  it("counts each kind against its own clock", () => {
    expect(migration).toMatch(/\(m\.parent_id is null\) = \(new\.parent_id is null\)/);
  });
});

/**
 * A post that looks like one thing in a list and another when opened is two
 * designs to keep in step.
 */
describe("one row, two screens", () => {
  it("renders both through the same component", () => {
    expect(roomPage).toMatch(/<PostRow/);
    expect(thread).toMatch(/<PostRow/);
  });

  it("takes both from the same projection", () => {
    expect(roomPage).toMatch(/rpc\("room_feed"/);
    expect(thread).toMatch(/rpc\("room_thread"/);
    expect(sql).toMatch(/room_thread\(uuid\) is[\s\S]{0,140}same projection room_feed uses/);
  });
});

/**
 * Hiding a zero meant most posts showed a heart with nothing beside it, which
 * reads as a count that has not loaded rather than as a count of none — and it
 * made the control jump sideways the moment somebody pressed it.
 */
describe("the counts are always there", () => {
  it("shows a like count of nought", () => {
    expect(like).toMatch(/className="tabular-nums">\s*\{view\.count\}/);
    expect(withoutComments(like)).not.toMatch(/count > 0 \?/);
  });

  /** A row where one number appears and the other does not reads as a bug. */
  it("shows a comment count of nought too", () => {
    expect(row).toMatch(/<span className="tabular-nums">\{post\.comment_count\}<\/span>/);
    expect(row).not.toMatch(/comment_count > 0 \?/);
  });
});

const replyCtx = read("./[roomId]/reply-context.tsx");
const replyBtn = read("./[roomId]/reply-button.tsx");

/**
 * A comment cannot have a comment — the database refuses one, and one level is
 * the whole shape of this. So answering a commenter is not a deeper row: it is
 * the same box, addressed to somebody, which is what the second level of a
 * Facebook thread is once you stop drawing the indent.
 */
describe("replying to a commenter", () => {
  /**
   * On both, since a member reading a thread is exactly where they decide to
   * answer the post. This used to assert the opposite; see the block below for
   * what tells the two presses apart.
   */
  it("offers Reply on the post and on every comment", () => {
    expect(
      thread.slice(thread.indexOf("post={comment}"), thread.indexOf("post={comment}") + 300),
    ).toMatch(/replyable/);
    expect(
      thread.slice(thread.indexOf("post={root}"), thread.indexOf("post={root}") + 300),
    ).toMatch(/replyable/);
  });

  it("puts the name in the box the way Facebook does", () => {
    expect(forms).toMatch(
      /setBody\(\(current\) => \(current\.startsWith\(replyTo\) \? current : `\$\{replyTo\} `\)\)/,
    );
  });

  /** Without the move a member types in front of the person they are answering. */
  it("focuses the field and puts the caret after the name", () => {
    expect(forms).toMatch(/input\.focus\(\)/);
    expect(forms).toMatch(/setSelectionRange\(end, end\)/);
  });

  /** The name alone in a field could be something the member typed. */
  it("says who it is answering, and offers a way out", () => {
    expect(forms).toMatch(/C\.postReplyingTo\(replyTo\)/);
    expect(forms).toMatch(/C\.postReplyCancel/);
  });

  /**
   * The name is whatever the projection gave the row — a display name, or the
   * alias of somebody posting anonymously. Neither is an id, so addressing a
   * reply to an anonymous member gives nothing away.
   */
  it("addresses the projected name, never an id", () => {
    expect(row).toMatch(/<ReplyButton name=\{post\.author_name\}/);
    expect(replyBtn).not.toMatch(/author_id|user_id/);
  });

  /** Nothing structured and nothing stored: it is a message that says who it is for. */
  it("stores no reply target of its own", () => {
    const migration = read(
      "../../../../../../supabase/migrations/20260819000900_a_like_that_answers_and_a_reply_that_does_not_wait.sql",
    );
    expect(migration).not.toMatch(/reply_to|mention/);
  });
});

/**
 * The first attempt drew the bubble as one big arc with the tail hung off the
 * side of it, and it came out lying on its face.
 */
describe("the comment icon is a speech bubble", () => {
  it("is a rounded rectangle with a tail, not an arc", () => {
    const icon = like.slice(like.indexOf("export function CommentIcon"));
    expect(icon).toMatch(
      /d="M5 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/,
    );
  });
});

/**
 * Oldest-first held for a handful of replies and stopped holding at twenty: the
 * newest is the one a member came back for, and putting it last means scrolling
 * past everything they have already read.
 */
describe("a thread reads from the top", () => {
  const migration = read(
    "../../../../../../supabase/migrations/20260819001000_newest_reply_first.sql",
  );

  it("puts the post first and the newest reply next", () => {
    expect(migration).toMatch(/order by \(m\.id = p_message_id\) desc, m\.created_at desc/);
  });

  /** The name is the one thing on a row that says whose words these are. */
  it("bolds the name", () => {
    expect(row).toMatch(/truncate font-medium/);
  });

  /**
   * A comment reads as an answer because it is smaller and set in from the
   * edge, not because it is labelled as one.
   */
  /** The sizes themselves are asserted below, where they were last changed. */
  it("renders a comment as a comment", () => {
    expect(thread).toMatch(/variant="comment"/);
  });

  /**
   * Above the comments it was the first thing on the way in and the last thing
   * reachable on the way back — and pressing Reply sent focus upward past
   * everything just read.
   */
  it("puts the box at the bottom", () => {
    expect(thread.indexOf("<CommentComposer")).toBeGreaterThan(thread.indexOf("</ul>"));
  });
});

const chatPage = read("../chats/[id]/page.tsx");
const roomPage = read("./[roomId]/page.tsx");

/**
 * A PostgrestBuilder is a thenable: the request is made inside then(), so
 * `void supabase.rpc(...)` built the call and threw it away without ever
 * sending it. Four places did this — both view recorders, mark_room_read and
 * mark_chat_read — so read markers never cleared and the view count sat at
 * nought forever, silently, because a fire-and-forget failure looks exactly
 * like a fire-and-forget success.
 */
describe("the fire-and-forget calls are actually sent", () => {
  it("uses after() rather than discarding the builder", () => {
    for (const [name, source] of [
      ["room page", roomPage],
      ["thread page", thread],
      ["chat page", chatPage],
    ] as const) {
      expect(withoutComments(source), `${name} must not drop a builder`).not.toMatch(
        /void supabase\.rpc/,
      );
      expect(source, `${name} must schedule it`).toMatch(/after\(async \(\) => \{/);
    }
  });

  /** after() runs once the response is sent, which is what the void was for. */
  it("awaits inside, so the promise is not dropped again", () => {
    expect(roomPage).toMatch(/await supabase\.rpc\("mark_room_read"/);
    expect(roomPage).toMatch(/await supabase\.rpc\("record_room_views"/);
    expect(chatPage).toMatch(/await supabase\.rpc\("mark_chat_read"/);
  });
});

describe("a post and its replies do not look alike", () => {
  it("sizes them well apart", () => {
    expect(row).toMatch(/size=\{isComment \? 24 : 46\}/);
    expect(row).toMatch(/isComment\s*\n?\s*\? "text-\[12\.4px\] leading-\[1\.5\]"/);
  });

  /** An indent alone is a margin, and a margin is invisible on its own. */
  /**
   * The indent alone, with no rules at all.
   *
   * The hairlines drew a box around every row and made a conversation read as
   * a table of them. A comment sits in from the page edge and a reply sits in
   * from the comment; that is enough to say which is which.
   */
  it("sets the reply column in without ruling it", () => {
    const list = thread.slice(thread.indexOf('<ul className="-mx-6'));
    expect(list).toMatch(/className="ml-16 py-2 pr-6 pl-4"/);
    // The lookahead matters: "border-line" contains "border-l", and the naive
    // version of this failed on the colour token rather than on a rule.
    expect(list).not.toMatch(/\bborder-[bl](?![a-z])/);
  });

  /** border-y plus the list's border-t drew two rules with ground between. */
  it("draws one rule under the post, not two", () => {
    expect(thread).toMatch(/-mx-6 border-t border-line px-6 pt-5 pb-4/);
    expect(withoutComments(thread)).not.toMatch(/border-y border-line/);
  });

  /**
   * Only a post is recorded as seen — a comment was on screen because the post
   * was — so a comment's count can only ever read "Seen by 0 people", which is
   * a number that cannot move pretending to be one that has not.
   */
  it("shows no view count on a comment", () => {
    expect(row).toMatch(/post\.view_count !== null && !isComment/);
  });
});

/**
 * An empty field under every thread is the product asking a question nobody
 * was asked, on a screen somebody opened to read.
 */
describe("the box waits to be asked for", () => {
  /**
   * And shows nothing while it waits. There was an "Add a comment" trigger
   * here, at the bottom of a page that already ends in Reply on the post and
   * Reply on every comment — three ways into one box.
   */
  it("renders nothing until a Reply is pressed", () => {
    expect(forms).toMatch(/if \(!open\) return null;/);
    expect(forms).not.toMatch(/postCommentOpenLabel/);
  });

  /**
   * Sending was the only way out, so changing your mind meant posting
   * something or leaving the page.
   */
  it("closes on Escape and on a control", () => {
    expect(forms).toMatch(/if \(event\.key === "Escape"\) closeComposer\(\)/);
    expect(forms).toMatch(/onClick=\{closeComposer\}/);
    expect(forms).toMatch(/aria-label=\{C\.decisionDismiss\}/);
  });

  it("opens when a reply is aimed at somebody", () => {
    expect(replyCtx).toMatch(/if \(name\) \{[\s\S]{0,60}setOpen\(true\)/);
  });

  /**
   * The first version kept a ref in the context and focused it in a
   * queueMicrotask — which ran BEFORE React had rendered the field, so the ref
   * was null and the focus went nowhere. Focusing belongs to the composer,
   * because the composer is the thing that mounts.
   */
  it("focuses after the field exists", () => {
    expect(forms).toMatch(/useEffect\(\(\) => \{[\s\S]{0,200}input\.focus\(\)/);
    expect(forms).toMatch(/\}, \[open, focusRequest\]\)/);
    expect(withoutComments(replyCtx)).not.toMatch(/queueMicrotask/);
  });

  /**
   * A counter, not a boolean: focus has to move again when Reply is pressed on
   * a second comment while the box is already open, and nothing else about the
   * state has changed at that point.
   */
  it("can move focus twice without anything else changing", () => {
    expect(replyCtx).toMatch(/setFocusRequest\(\(n\) => n \+ 1\)/);
  });

  it("closes again once something is sent", () => {
    expect(forms).toMatch(/closeComposer\(\);/);
  });
});

/**
 * The name a member replies to is plain text in the body — no reply_to column,
 * no mention table — so the only way to find it again is to recognise it, and
 * the thread already knows every name it contains.
 */
describe("a mention reads as a name", () => {
  it("matches against the names on the page", () => {
    expect(thread).toMatch(/mentionable=\{names\}/);
    expect(thread).toMatch(/thread\.map\(\(r\) => r\.author_name\)/);
  });

  /** Weight alone is easy to miss at 12px. */
  it("sets it apart by weight and colour", () => {
    expect(row).toMatch(/<span className="font-medium text-accent">\{mention\}<\/span>/);
  });

  /** "Sepia Rose" must not read as "Sepia" with a stray word after it. */
  it("prefers the longest name that matches", () => {
    expect(row).toMatch(/\.sort\(\(a, b\) => b\.length - a\.length\)\[0\]/);
  });

  /** A name only counts at the start, where the reply put it. */
  it("only recognises it at the front", () => {
    expect(row).toMatch(/post\.body\.startsWith\(`\$\{name\} `\)/);
  });
});

describe("answering from inside a thread", () => {
  /** The only other way in was the button under every comment. */
  it("puts Reply on the post as well", () => {
    expect(thread).toMatch(/post=\{root\}[\s\S]{0,200}replyable/);
  });

  /**
   * A comment on a post is already addressed to whoever wrote it, so
   * prefilling their name would put it at the front of every top-level answer
   * for nothing.
   */
  it("opens the box without a name when it is the post", () => {
    expect(row).toMatch(/isComment && post\.author_name \?[\s\S]{0,60}<ReplyButton name=/);
    expect(replyBtn).toMatch(/name \? setReplyTo\(name, parentId \?\? null\) : openComposer\(\)/);
  });
});

describe("the reply column is a smaller slot, not smaller things", () => {
  it("indents further and tightens the rows", () => {
    expect(thread).toMatch(/className="ml-16 py-2 pr-6 pl-4"/);
  });

  /** Nothing inside changed size — that was asked for explicitly. */
  it("leaves what is inside alone", () => {
    expect(row).toMatch(/size=\{isComment \? 24 : 46\}/);
    expect(row).toMatch(/isComment\s*\n?\s*\? "text-\[12\.4px\] leading-\[1\.5\]"/);
  });
});

describe("the view count is an eye", () => {
  it("shows the icon and the number", () => {
    expect(row).toMatch(/<EyeIcon \/>/);
    expect(row).toMatch(/\{post\.view_count\}/);
  });

  /** "12" next to an eye is not self-explanatory to a reader. */
  it("keeps the sentence for a screen reader", () => {
    expect(row).toMatch(
      /<span className="sr-only">\{C\.postViewCount\(post\.view_count\)\}<\/span>/,
    );
  });
});

/**
 * A thread over the room rather than instead of it.
 *
 * The interception is what makes the URL real: a shared link, a refresh or an
 * arrival from outside falls through to the page, because `(.)` only applies to
 * a soft navigation from inside the room.
 */
describe("the thread opens over the roomPage", () => {
  it("renders the same component on both surfaces", () => {
    expect(threadPage).toMatch(/<Thread roomId=\{roomId\} postId=\{post\} \/>/);
    expect(threadModal).toMatch(/<Thread roomId=\{roomId\} postId=\{post\} \/>/);
  });

  /** @modal is a slot, not a segment, so [post] is one level across. */
  it("intercepts the sibling segment", () => {
    expect(threadModal).toMatch(/`\(\.\)` intercepts the sibling `\[post\]` segment/);
  });

  /**
   * A slot with no default renders a 404 when it cannot match the URL — so
   * without this every hard load of a room would fail rather than show no
   * modal.
   */
  it("has a default that renders nothing", () => {
    const fallback = read("./[roomId]/@modal/default.tsx");
    expect(fallback).toMatch(/return null/);
  });

  it("passes the slot through the room's layout", () => {
    const layout = read("./[roomId]/layout.tsx");
    expect(layout).toMatch(/modal: React\.ReactNode/);
    expect(layout).toMatch(/\{modal\}/);
  });

  /**
   * The attribute alone gives a dialog with no focus trap, no Escape, no
   * inertness behind it and no ::backdrop — which is to say none of the
   * reasons to use a dialog.
   */
  it("opens with showModal rather than the open attribute", () => {
    expect(routeModal).toMatch(/showModal\(\)/);
    expect(withoutComments(routeModal)).not.toMatch(/<dialog[^>]*\sopen\b/);
  });

  /** The keyboard, the backdrop and the button all leave the same way. */
  it("navigates back from one place only", () => {
    expect(routeModal).toMatch(/onClose=\{\(\) => router\.back\(\)\}/);
    expect(routeModal.match(/router\.back\(\)/g)).toHaveLength(1);
  });

  /** A click on padding inside the panel must not dismiss it. */
  it("tests the backdrop click against the dialog itself", () => {
    expect(routeModal).toMatch(/event\.target === dialog\.current/);
  });
});

const replies = read("./[roomId]/replies.tsx");

/**
 * Facebook nests one layer and stops, and the reason it stops is the reason
 * this does: a second layer is a thread, a third is a tree, and a tree on a
 * phone is a horizontal scrollbar.
 */
describe("replies nest one layer and no further", () => {
  const migration = read(
    "../../../../../../supabase/migrations/20260819001100_one_layer_of_nesting.sql",
  );

  /** The parent being a comment is fine; the parent being a reply is not. */
  it("refuses a third level in the database", () => {
    expect(migration).toMatch(/if v_grandparent_parent is not null then/);
    expect(migration).toMatch(/a reply cannot be replied to/);
  });

  it("returns the parent, so the page can nest", () => {
    expect(migration).toMatch(/returns table \(\s*id uuid,\s*parent_id uuid,/);
    expect(thread).toMatch(/row\.parent_id === root\?\.id/);
    expect(thread).toMatch(/thread\.filter\(\(row\) => row\.parent_id === commentId\)/);
  });

  /**
   * Answering a REPLY nests under that reply's parent, because a third level
   * would be refused — so the press carries the comment it belongs to rather
   * than the row it came from.
   */
  it("files a reply under the comment, not under the row pressed", () => {
    expect(thread).toMatch(/replyToId=\{comment\.id\}/);
    expect(thread.match(/replyToId=\{comment\.id\}/g)).toHaveLength(2);
    expect(forms).toMatch(/value=\{replyParentId \?\? parentId\}/);
  });

  /**
   * The middle of the chain, which is the piece that broke.
   *
   * Every link either side was asserted — the thread passes replyToId, the
   * composer reads replyParentId — and the one in between was not, so PostRow
   * accepted the prop and dropped it. Every new reply went to the post, the
   * types were happy because an unused prop is not an error, and the two tests
   * that existed both passed.
   */
  it("passes the parent from the row to the button", () => {
    expect(row).toMatch(/<ReplyButton name=\{post\.author_name\} parentId=\{replyToId\} \/>/);
  });

  it("carries it into the context", () => {
    expect(replyBtn).toMatch(/setReplyTo\(name, parentId \?\? null\)/);
    expect(replyCtx).toMatch(/setReplyParentId\(parentId\)/);
  });

  /** Nine replies under one comment push the next comment off the screen. */
  /** Collapsed unless asked for, or unless this is the comment being answered. */
  it("collapses them until asked for", () => {
    expect(replies).toMatch(/const \[open, setOpen\] = useState\(false\)/);
    expect(replies).toMatch(/aria-expanded=\{showing\}/);
    expect(replies).toMatch(/C\.postShowReplies\(count\)/);
  });

  it("shows nothing at all when there are none", () => {
    expect(replies).toMatch(/if \(count === 0\) return null;/);
  });

  /**
   * Two questions, two answers: "3 replies" under a comment counts direct
   * children, and a roomPage row claiming how many comments a post has counts
   * every descendant.
   */
  it("counts direct children in a thread and every descendant in the roomPage", () => {
    expect(migration).toMatch(
      /select count\(\*\) from visible c where c\.parent_id = m\.id\)::integer/,
    );
    expect(migration).toMatch(
      /or c\.parent_id in \(select d\.id from visible d where d\.parent_id = m\.id\)/,
    );
  });
});

describe("nothing scrolls behind the modal", () => {
  it("locks the document while any dialog is open", () => {
    const css = read("../../../styles/globals.css");
    expect(css).toMatch(/html:has\(dialog\[open\]\) \{\s*overflow: hidden;/);
  });

  /**
   * Flush to the bottom on a phone.
   *
   * Held off the nav it read as a panel floating in the middle of nothing,
   * which is what a gap under a bottom sheet always looks like. Covering the
   * nav is fine: showModal() has already made everything behind it inert.
   */
  /**
   * Stated, not inferred. `mt-auto mb-0` asks the browser to resolve auto
   * margins inside a UA dialog box that already sets inset, margin and its own
   * max-height — and when those over-constrain, the browser decides where the
   * box lands, not us.
   */
  it("reaches the bottom of the screen", () => {
    expect(routeModal).toMatch(/fixed inset-x-0 top-auto bottom-0/);
    expect(withoutComments(routeModal)).not.toMatch(/\bmt-auto\b/);
  });

  /** The last line needs room for a thumb and a phone's home indicator. */
  it("leaves room under the last line", () => {
    expect(routeModal).toMatch(/pb-10/);
  });

  /** A sheet is not the idiom on a wide screen. */
  it("centres on anything wider", () => {
    expect(routeModal).toMatch(/sm:m-auto/);
  });
});

/**
 * Two lists asking two different questions.
 *
 * The comment list is a roomPage — a member comes back to see what is new. A reply
 * thread is a conversation between two or three people about one thing, read
 * forwards, because the second reply is usually an answer to the first and
 * reversing them makes an argument run backwards.
 */
describe("a reply thread reads forwards", () => {
  const migration = read(
    "../../../../../../supabase/migrations/20260819001200_a_reply_thread_reads_forwards.sql",
  );

  it("keeps comments newest first", () => {
    expect(migration).toMatch(/case when m\.parent_id = p_message_id then m\.created_at end desc/);
  });

  it("puts replies oldest first", () => {
    const order = migration.slice(migration.indexOf("order by"));
    expect(order).toMatch(/m\.created_at asc;/);
  });

  /**
   * The rows come back flat and the page groups them, so the two directions
   * only have to be right against their own subset — this key is what keeps
   * them from applying to each other.
   */
  it("separates the levels so neither sort reaches the other", () => {
    expect(migration).toMatch(/case when m\.parent_id = p_message_id then 0 else 1 end/);
  });

  it("still puts the post first", () => {
    const order = migration.slice(migration.indexOf("order by"));
    expect(order.indexOf("(m.id = p_message_id) desc")).toBeLessThan(order.indexOf("created_at"));
  });
});

const lightbox = read("./[roomId]/image-lightbox.tsx");

/**
 * A row holds a like button and a menu, and an anchor cannot contain a button.
 * So the link is stretched over the row and the controls are lifted above it.
 */
describe("the post itself is the target", () => {
  it("stretches a link over the row rather than wrapping it", () => {
    expect(row).toMatch(/<Link href=\{href\} className="absolute inset-0 z-10">/);
    expect(roomPage).toMatch(/href=\{`\/app\/rooms\/\$\{room\.id as string\}\/\$\{post\.id\}`\}/);
  });

  /** Without this the whole strip would open the thread and nothing would work. */
  it("lifts the controls above it", () => {
    expect(row).toMatch(/relative z-20 mt-1 flex items-center gap-5/);
    expect(row).toMatch(/<span className="relative z-20">\s*<OverflowMenu/);
  });

  /** Only the menu, so the name and the time still open the thread. */
  it("leaves the rest of the header under the link", () => {
    expect(row).toMatch(/<div className="flex items-baseline justify-between gap-3">/);
  });

  it("names the target for a reader", () => {
    expect(row).toMatch(/C\.postOpenThread\(post\.author_name \?\? C\.threadUnknownPerson\)/);
  });
});

describe("the photograph opens full screen", () => {
  /** Every one of Modal's decisions is the opposite of what a lightbox wants. */
  /**
   * And carries no display utility, or a closed one stays in the layout as a
   * full-viewport click-catcher — see the dialog gate in design-system.test.ts.
   * The column lives on a wrapper inside.
   */
  it("uses its own dialog, edge to edge", () => {
    expect(lightbox).toMatch(/fixed inset-0 m-0 h-full max-h-none w-full max-w-none/);
    expect(lightbox).toMatch(/<div className="flex h-full flex-col">/);
    expect(lightbox).toMatch(/showModal\(\)/);
  });

  /** A member should still be able to like the thing they are looking at. */
  it("carries the counts under it", () => {
    expect(row).toMatch(/<PostImage path=\{post\.image_path\} footer=\{<Counts \/>\} \/>/);
    expect(lightbox).toMatch(/\{footer\}/);
  });

  /** The picture opens full screen; the rest of the post opens the thread. */
  it("sits above the link covering the row", () => {
    expect(lightbox).toMatch(/relative z-20 mt-2 block w-full cursor-zoom-in/);
  });

  /** Anywhere but the picture closes it. */
  it("closes on a press outside the image", () => {
    expect(lightbox).toMatch(/if \(event\.target !== dialog\.current\) return;/);
    expect(lightbox).toMatch(/onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  });

  /** Or the image refuses to shrink and pushes the counts off the bottom. */
  it("lets the image shrink inside the column", () => {
    expect(lightbox).toMatch(/min-h-0 flex-1/);
  });
});

/**
 * Pressing Reply on a comment whose replies are folded away puts the answer
 * somewhere the member cannot see: they write it, it lands, and nothing on
 * screen changes.
 */
describe("answering a comment opens its replies", () => {
  it("opens while that comment is the one being answered", () => {
    expect(replies).toMatch(/const showing = open \|\| replyParentId === commentId/);
    expect(thread).toMatch(/<Replies commentId=\{comment\.id\} count=/);
  });

  /** Including what the toggle says and which way its chevron points. */
  it("uses that everywhere the toggle reflects its own state", () => {
    expect(replies).toMatch(/aria-expanded=\{showing\}/);
    expect(replies).toMatch(/\{showing \? C\.postHideReplies : C\.postShowReplies\(count\)\}/);
    expect(replies).toMatch(/\{showing \? <ul/);
  });
});
