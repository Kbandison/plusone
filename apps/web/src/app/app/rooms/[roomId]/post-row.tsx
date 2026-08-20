import Link from "next/link";

import { DRAFT_COPY } from "@plusone/config";
import { chat as chatLogic } from "@plusone/logic";

import type { MemberPhoto } from "@/lib/photo-urls";
import { BlockButton, ReportControl } from "@/app/app/safety/safety-controls";
import { MemberPhotoFrame } from "../../member-photo";
import { OverflowMenu } from "../../overflow-menu";
import { CommentIcon, EyeIcon, LikeButton } from "./like-button";
import { PostImage } from "./post-image";
import { ReplyButton } from "./reply-button";
import { ShareMenu, type ShareRoom } from "./share-menu";

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
  readonly image_path: string | null;
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
  /** Present exactly on the posts that are news; null on everything else. */
  readonly article_url: string | null;
  readonly article_title: string | null;
  readonly article_icon: string | null;
  /** Who brought it into this room. Null on everything posted here first. */
  readonly shared_by_name: string | null;
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
  replyToId,
  href,
  shareUrl,
  shareRooms,
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
  /**
   * The comment a reply from this row should nest under.
   *
   * A row's own id when it IS the comment, and its parent's when it is one of
   * the replies below — because two levels is the whole shape and a third
   * would be refused.
   */
  replyToId?: string;
  /**
   * Makes the whole row open the thread.
   *
   * A link stretched over the row rather than a wrapper around it: the row
   * holds a like button and a menu, and an anchor cannot contain a button. The
   * controls are lifted above the link instead, so the interactive parts stay
   * interactive and everything between them is one target.
   */
  href?: string;
  /** Where this post lives, for a link somebody can send. */
  shareUrl?: string;
  /** The rooms this member could share it into. Empty means no such option. */
  shareRooms?: readonly ShareRoom[];
}) {
  const postedAt = Date.parse(post.created_at);
  const isComment = variant === "comment";

  // The longest match wins, so "Sepia Rose" is not read as "Sepia" with a
  // stray word after it.
  const mention = (mentionable ?? [])
    .filter((name) => post.body.startsWith(`${name} `))
    .sort((a, b) => b.length - a.length)[0];

  /**
   * The like, the comment link, Reply, and the view count.
   *
   * Declared here so it closes over this row rather than taking eight props,
   * and rendered twice: under the post, and again under the photograph when it
   * is full screen — where a member should still be able to like the thing
   * they are looking at.
   *
   * z-20 lifts it above the link covering the row. Without that the whole strip
   * would open the thread and none of the controls would do anything.
   */
  function Counts() {
    return (
      // flex-wrap, because this is five controls now — like, comments, share,
      // reply and the view count — and a row that cannot wrap is a row that
      // makes the page wider than the phone.
      <div className="relative z-20 mt-1 flex flex-wrap items-center gap-x-5 gap-y-1">
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

        {shareUrl ? (
          <ShareMenu
            url={shareUrl}
            title={post.article_title ?? post.body}
            messageId={post.id}
            rooms={shareRooms ?? []}
          />
        ) : null}

        {/* On a comment it addresses that person; on the post at the top of
              a thread it just opens the box, because a comment on a post is
              already addressed to whoever wrote it. */}
        {replyable ? (
          isComment && post.author_name ? (
            <ReplyButton name={post.author_name} parentId={replyToId} />
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
    );
  }

  return (
    <div className="relative">
      {/* Somebody chose to bring this here, and that is most of what a share
          means. Above the post rather than inside it, because it is a fact
          about how the post arrived and not part of what it says — which is
          also why it is a column and not a line prepended to the body, where
          the next share would carry it along again. */}
      {post.shared_by_name ? (
        <p className="mb-2 text-[11px] text-ink-3">{C.postSharedBy(post.shared_by_name)}</p>
      ) : null}

      <div className="flex items-start gap-3">
        {/* The row, as one target.
          Stretched over everything rather than wrapped around it, because an
          anchor cannot contain the button and the menu this row also has. The
          controls sit above it; the words and the face are underneath, which is
          what makes the post itself clickable. */}
        {href ? (
          <Link href={href} className="absolute inset-0 z-10">
            <span className="sr-only">
              {C.postOpenThread(post.author_name ?? C.threadUnknownPerson)}
            </span>
          </Link>
        ) : null}

        {/* An anonymous author has no photo, so the frame's empty state is the
          placeholder — the same neutral shape a member with no photo gets,
          rather than a second thing to learn the meaning of. */}
        {post.article_url ? (
          // The publisher's mark where a member's photograph would be.
          // referrerPolicy, because fetching it otherwise tells their server that
          // somebody in a health community is reading them — the same visit the
          // link itself takes care not to hand over.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.article_icon ?? ""}
            alt=""
            referrerPolicy="no-referrer"
            loading="lazy"
            width={isComment ? 24 : 46}
            height={isComment ? 24 : 46}
            className="shrink-0 rounded-full border border-line-2 bg-surface-2 object-contain"
            style={{ width: isComment ? 24 : 46, height: isComment ? 24 : 46 }}
          />
        ) : (
          <MemberPhotoFrame photo={post.author_id ? photo : undefined} size={isComment ? 24 : 46} />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="flex min-w-0 items-baseline gap-2">
              {/* Bold, because it is the one thing on the row that says whose
                words these are — and in a room where a name may be a pseudonym
                that is the fact a reader is looking for first. */}
              {/* A publisher's name is not a member's name. It labels the
                article below it rather than announcing who is speaking, so it
                sits at the size a label sits at. */}
              <span
                className={`truncate font-medium ${
                  post.article_url
                    ? "text-[11.5px] text-ink-2"
                    : isComment
                      ? "text-[12px]"
                      : "text-[15.5px]"
                }`}
              >
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

            {/* Lifted above the link covering the row — only this, not the whole
              header, so the name and the time still open the thread. */}
            {/* An article has nobody to report and nobody to block — the block
              control resolves an author from the message and there is none, so
              the menu was a control that could only fail. */}
            {!post.is_mine && !post.article_url ? (
              <span className="relative z-20">
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
              </span>
            ) : null}
          </div>

          {/* The controls above point at this id, which is what tells a screen
            reader user which post they are about to report — every one of them
            is otherwise just "Report, button". */}

          {/* The headline is the way out to the original.
            z-20 so it clears the link covering the row: the title opens the
            article, everything around it opens the thread. target and rel for
            the reason every outbound link here has them — the destination does
            not need to be told the reader came from a health community. */}
          {post.article_url ? (
            <a
              href={post.article_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ease-brand relative z-20 mt-0.5 block text-[15px] leading-[1.4] break-words underline decoration-line-control underline-offset-4 transition-colors duration-200 hover:decoration-accent"
            >
              {post.article_title}
            </a>
          ) : null}
          <p
            id={`post-${post.id}`}
            className={`mt-1 break-words whitespace-pre-wrap ${
              post.article_url
                ? "line-clamp-3 text-[12.4px] leading-[1.55] text-ink-2"
                : isComment
                  ? "text-[12.4px] leading-[1.5]"
                  : "text-[17px] leading-[1.55]"
            }`}
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

          {post.image_path ? <PostImage path={post.image_path} footer={<Counts />} /> : null}

          <Counts />
        </div>
      </div>
    </div>
  );
}
