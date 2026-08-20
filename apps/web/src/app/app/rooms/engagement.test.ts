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
    expect(feed).toMatch(/record_room_views"[\s\S]{0,80}posts\.map\(\(post\) => post\.id\)/);
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
   * the props it was given. Nothing revalidated the feed, so those props still
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
   * Re-rendering a hundred-post feed to learn one number the RPC already
   * returned is a lot of work for the control a member presses most.
   */
  it("does not revalidate the whole feed for one number", () => {
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
    expect(feed).toMatch(/<PostRow/);
    expect(thread).toMatch(/<PostRow/);
  });

  it("takes both from the same projection", () => {
    expect(feed).toMatch(/rpc\("room_feed"/);
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
    expect(replyCtx).toMatch(/field\.focus\(\)/);
    expect(replyCtx).toMatch(/setSelectionRange\(end, end\)/);
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
    expect(row).toMatch(/isComment \? "text-\[12\.4px\] leading-\[1\.5\]" : "text-\[17px\]/);
  });

  /** An indent alone is a margin, and a margin is invisible on its own. */
  /** The exact indent is asserted below, where it was last changed. */
  it("rules the reply column down its left", () => {
    expect(thread).toMatch(/border-l-2 border-l-line-2/);
  });

  /** border-y plus the list's border-t drew two rules with ground between. */
  it("draws one rule under the post, not two", () => {
    expect(thread).toMatch(/-mx-6 mt-2 border-t border-line px-6 pt-5 pb-4/);
    expect(thread).not.toMatch(/border-y border-line/);
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
    expect(replyCtx).toMatch(/if \(name\) setOpen\(true\)/);
  });

  /** Pressing Reply is what renders the field; focusing before that paint focuses nothing. */
  it("focuses after the field exists", () => {
    expect(replyCtx).toMatch(/queueMicrotask\(\(\) => \{/);
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
    expect(thread).toMatch(/rows\.map\(\(r\) => r\.author_name\)/);
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
    expect(replyBtn).toMatch(/name \? setReplyTo\(name\) : openComposer\(\)/);
  });
});

describe("the reply column is a smaller slot, not smaller things", () => {
  it("indents further and tightens the rows", () => {
    expect(thread).toMatch(/ml-16 border-b border-line border-l-2 border-l-line-2 py-2/);
  });

  /** Nothing inside changed size — that was asked for explicitly. */
  it("leaves what is inside alone", () => {
    expect(row).toMatch(/size=\{isComment \? 24 : 46\}/);
    expect(row).toMatch(/isComment \? "text-\[12\.4px\] leading-\[1\.5\]"/);
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
