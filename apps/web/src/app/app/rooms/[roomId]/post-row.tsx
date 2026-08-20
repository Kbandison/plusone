import Link from "next/link";

import { DRAFT_COPY } from "@plusone/config";
import { chat as chatLogic } from "@plusone/logic";

import type { MemberPhoto } from "@/lib/photo-urls";
import { BlockButton, ReportControl } from "@/app/app/safety/safety-controls";
import { MemberPhotoFrame } from "../../member-photo";
import { OverflowMenu } from "../../overflow-menu";
import { CommentIcon, EyeIcon, LikeButton } from "./like-button";
import { ReplyButton } from "./reply-button";

const C = DRAFT_COPY.app;

/**
 * Exactly what room_feed and room_thread both return.
 *
 * One shape, so anonymity is decided in one place — the SQL — and every surface
 * that renders a post inherits the decision rather than restating it.
 */
export interface Post {
  readonly id: string;
  readonly body: string;
  readonly created_at: string;
  readonly anonymous: boolean;
  /** Null for an anonymous post. There is no branch where it is not. */
  readonly author_id: string | null;
  readonly author_name: string | null;
  readonly is_mine: boolean;
  readonly like_count: number;
  readonly i_liked: boolean;
  readonly comment_count: number;
  /** The author's own count, and null to everybody else. */
  readonly view_count: number | null;
}

/**
 * One post, wherever it appears.
 *
 * The feed and the thread page render the same row, because a post that looks
 * like one thing in a list and another thing when opened is two designs to keep
 * in step. `commentHref` is the only difference: in a thread there is nowhere
 * further to go.
 */
export function PostRow({
  post,
  photo,
  zone,
  now,
  commentHref,
  variant = "post",
  mentionable,
  replyable = false,
}: {
  post: Post;
  photo: MemberPhoto | undefined;
  zone: string;
  now: number;
  /** Absent for a comment, and for the post you are already looking at. */
  commentHref?: string;
  /**
   * How much of the page this row is entitled to.
   *
   * "post" is the thing a screen is about — the row in a feed, or the post at
   * the top of a thread. "comment" is an answer to one, and reads as an answer
   * because it is smaller and set in from the edge rather than because it is
   * labelled as one.
   */
  variant?: "post" | "comment";
  /**
   * Every name in this thread, so a reply that opens with one can show it as a
   * name rather than as the first two words of a sentence.
   *
   * Matched rather than stored. The name a member replies to goes into the box
   * as plain text — no reply_to column, no mention table — so the only way to
   * find it again is to recognise it, and the thread already knows every name
   * it contains.
   */
  mentionable?: readonly string[];
  /**
   * Shows a Reply control that addresses this row's author.
   *
   * On a comment, because a comment cannot have a comment — the database
   * refuses one. Answering somebody puts their name in the same box everyone
   * else is using, which is what the second level of a Facebook thread
   * actually is once you stop drawing the indent.
   */
  replyable?: boolean;
}) {
  const postedAt = Date.parse(post.created_at);
  const isComment = variant === "comment";

  // The longest match wins, so "Sepia Rose" is not read as "Sepia" with a
  // stray word after it.
  const mention = (mentionable ?? [])
    .filter((name) => post.body.startsWith(`${name} `))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <div className="flex items-start gap-3">
      {/* An anonymous author has no photo, so the frame's empty state is the
          placeholder — the same neutral shape a member with no photo gets,
          rather than a second thing to learn the meaning of. */}
      <MemberPhotoFrame photo={post.author_id ? photo : undefined} size={isComment ? 24 : 46} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="flex min-w-0 items-baseline gap-2">
            {/* Bold, because it is the one thing on the row that says whose
                words these are — and in a room where a name may be a pseudonym
                that is the fact a reader is looking for first. */}
            <span className={`truncate font-medium ${isComment ? "text-[12px]" : "text-[15.5px]"}`}>
              {post.author_name ?? C.threadUnknownPerson}
            </span>
            {post.anonymous ? (
              // Said plainly. A pseudonym that does not announce itself is a
              // name a reader will take for a real one.
              <span className="shrink-0 text-[10.5px] text-ink-3">{C.postAnonymous}</span>
            ) : null}
            <time
              dateTime={new Date(postedAt).toISOString()}
              title={chatLogic.messageTimeExact(postedAt, zone)}
              className="shrink-0 text-[11px] text-ink-3 tabular-nums"
            >
              {chatLogic.compactAge(postedAt, now, zone)}
            </time>
          </p>

          {!post.is_mine ? (
            <OverflowMenu label={C.postMenuLabel} compact>
              <div className="py-3">
                {/* Neither control takes an author id, and for an anonymous
                    post the client does not have one. Both resolve it
                    server-side from the message. */}
                <ReportControl roomMessageId={post.id} describedBy={`post-${post.id}`} />
              </div>
              <div className="py-3">
                <BlockButton roomMessageId={post.id} describedBy={`post-${post.id}`} />
              </div>
            </OverflowMenu>
          ) : null}
        </div>

        {/* The controls above point at this id, which is what tells a screen
            reader user which post they are about to report — every one of them
            is otherwise just "Report, button". */}
        <p
          id={`post-${post.id}`}
          className={`mt-1 whitespace-pre-wrap ${isComment ? "text-[12.4px] leading-[1.5]" : "text-[17px] leading-[1.55]"}`}
        >
          {/* The person being answered, told apart from the answer.
              It is one string in the database, so without this the name is the
              first two words of a sentence and reads as part of it. Weight and
              colour together, because weight alone is easy to miss at 12px. */}
          {mention ? (
            <>
              <span className="font-medium text-accent">{mention}</span>
              {post.body.slice(mention.length)}
            </>
          ) : (
            post.body
          )}
        </p>

        <div className="mt-1 flex items-center gap-5">
          <LikeButton messageId={post.id} liked={post.i_liked} count={post.like_count} />

          {commentHref ? (
            <Link
              href={commentHref}
              aria-label={C.postCommentCount(post.comment_count)}
              className="ease-brand flex min-h-tap items-center gap-1.5 text-[11.5px] text-ink-3 transition-colors duration-200 hover:text-ink"
            >
              <CommentIcon />
              {/* Nought shown, like the like count beside it. A row where one
                  number appears and the other does not reads as a bug. */}
              <span className="tabular-nums">{post.comment_count}</span>
            </Link>
          ) : null}

          {/* On a comment it addresses that person; on the post at the top of
              a thread it just opens the box, because a comment on a post is
              already addressed to whoever wrote it. */}
          {replyable ? (
            isComment && post.author_name ? (
              <ReplyButton name={post.author_name} />
            ) : (
              <ReplyButton />
            )
          ) : null}

          {/* Author only, and phrased for them. "2 views" under somebody's
              diagnosis story reads worse than no number at all; the question
              they actually have is whether anyone saw it.

              Never on a comment. Only a post is recorded as seen — a comment
              was on the screen because the post was — so a comment's count can
              only ever read "Seen by 0 people", which is a number that cannot
              move pretending to be one that has not. */}
          {post.view_count !== null && !isComment ? (
            // An eye and a number, sitting with the other two counts rather
            // than a sentence sitting beside them. The words stay for a reader,
            // where "12" next to an eye is not self-explanatory.
            <span className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
              <EyeIcon />
              <span aria-hidden="true" className="tabular-nums">
                {post.view_count}
              </span>
              <span className="sr-only">{C.postViewCount(post.view_count)}</span>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
