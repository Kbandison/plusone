import Link from "next/link";

import { DRAFT_COPY } from "@plusone/config";
import { chat as chatLogic } from "@plusone/logic";

import type { MemberPhoto } from "@/lib/photo-urls";
import { BlockButton, ReportControl } from "@/app/app/safety/safety-controls";
import { MemberPhotoFrame } from "../../member-photo";
import { OverflowMenu } from "../../overflow-menu";
import { CommentIcon, LikeButton } from "./like-button";

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
}: {
  post: Post;
  photo: MemberPhoto | undefined;
  zone: string;
  now: number;
  /** Absent for a comment, and for the post you are already looking at. */
  commentHref?: string;
}) {
  const postedAt = Date.parse(post.created_at);

  return (
    <div className="flex items-start gap-3">
      {/* An anonymous author has no photo, so the frame's empty state is the
          placeholder — the same neutral shape a member with no photo gets,
          rather than a second thing to learn the meaning of. */}
      <MemberPhotoFrame photo={post.author_id ? photo : undefined} size={34} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-[13px]">
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
        <p id={`post-${post.id}`} className="mt-1 text-[13.5px] leading-[1.6] whitespace-pre-wrap">
          {post.body}
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

          {/* Author only, and phrased for them. "2 views" under somebody's
              diagnosis story reads worse than no number at all; the question
              they actually have is whether anyone saw it. */}
          {post.view_count !== null ? (
            <span className="text-[11px] text-ink-3">{C.postViewCount(post.view_count)}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
