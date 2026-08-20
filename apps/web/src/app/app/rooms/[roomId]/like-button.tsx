"use client";

import { useState, useTransition } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { toggleLike } from "./actions";

const C = DRAFT_COPY.app;

/**
 * The like, and the count beside it.
 *
 * Optimistic and then reconciled, which is not what this was.
 *
 * The first version used useOptimistic — and useOptimistic DISCARDS its value
 * when the transition ends, falling back to the props it was given. Nothing
 * revalidated the feed, so those props still said what the server had said
 * before the press: like, see 1, press again, see 0, watch it come back to 1.
 * The optimistic value was correct and the stale prop won.
 *
 * So the press moves the number immediately, the action returns what is now
 * actually stored, and that answer replaces the guess. A failed call falls back
 * to the last thing the server said, which is the same correction the optimistic
 * version was trying to make and this one actually keeps.
 */
export function LikeButton({
  messageId,
  liked,
  count,
}: {
  messageId: string;
  liked: boolean;
  count: number;
}) {
  const [, startTransition] = useTransition();

  // Adjusting state when props change, the documented way: a fresh render from
  // the server — after navigating away and back — has to win over a stale
  // local value, and comparing against the last props seen is what tells the
  // two apart without an effect.
  const [fromServer, setFromServer] = useState({ liked, count });
  const [view, setView] = useState({ liked, count });
  if (fromServer.liked !== liked || fromServer.count !== count) {
    setFromServer({ liked, count });
    setView({ liked, count });
  }

  return (
    <button
      type="button"
      onClick={() => {
        const next = { liked: !view.liked, count: view.count + (view.liked ? -1 : 1) };
        setView(next);
        startTransition(async () => {
          const actual = await toggleLike(messageId);
          // What is stored, or what the server last said. Never the guess.
          setView(actual ?? fromServer);
        });
      }}
      aria-pressed={view.liked}
      className={`ease-brand flex min-h-tap items-center gap-1.5 text-[11.5px] transition-colors duration-200 ${
        view.liked ? "text-accent" : "text-ink-3 hover:text-ink"
      }`}
    >
      <HeartIcon filled={view.liked} />

      {/* Always, including nought.
          Hiding a zero meant most posts showed a heart with nothing beside it,
          which reads as a count that has not loaded rather than as a count of
          none — and it made the control jump sideways the moment somebody
          pressed it.

          The number is the whole visual label, because a feed does not write
          "likes" forty times, so the accessible name has to carry the word. Not
          an aria-label: that would REPLACE the count rather than include it,
          and a reader would hear "Like, pressed" with no idea how many.
          tabular-nums so the row does not shift a pixel when 9 becomes 10. */}
      <span aria-hidden="true" className="tabular-nums">
        {view.count}
      </span>
      <span className="sr-only">
        {view.liked ? C.postUnlikeLabel : C.postLikeLabel} — {C.postLikeCount(view.count)}
      </span>
    </button>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
      className="size-[16px] shrink-0"
    >
      <path
        d="M12 20s-7-4.35-7-9a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 4.65-7 9-7 9Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CommentIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
      className="size-[16px] shrink-0"
    >
      {/* A speech bubble sitting upright with its tail at the bottom left.
          The first attempt drew the body as one big arc and hung the tail off
          the side of it, which came out lying on its face. This is a rounded
          rectangle and a tail, which is what the shape actually is. */}
      <path
        d="M5 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
      className="size-[16px] shrink-0"
    >
      <path
        d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
