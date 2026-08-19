"use client";

import { useOptimistic, useTransition } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { toggleLike } from "./actions";

const C = DRAFT_COPY.app;

/**
 * The like, and the count beside it.
 *
 * Optimistic, because a like that waits for a round trip before it moves feels
 * broken on a feed — it is the one control a member presses without thinking,
 * and the whole signal it gives back is that it moved.
 *
 * useOptimistic rather than a plain useState mirror: React reverts it if the
 * action throws, so a failed like corrects itself rather than leaving a heart
 * that lies until the next navigation.
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
  const [state, setState] = useOptimistic({ liked, count }, (_prev, next: boolean) => ({
    liked: next,
    count: count + (next ? 1 : 0) - (liked ? 1 : 0),
  }));

  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          setState(!state.liked);
          await toggleLike(messageId);
        })
      }
      aria-pressed={state.liked}
      className={`ease-brand flex min-h-tap items-center gap-1.5 text-[11.5px] transition-colors duration-200 ${
        state.liked ? "text-accent" : "text-ink-3 hover:text-ink"
      }`}
    >
      <HeartIcon filled={state.liked} />

      {/* The number is the whole visual label — a feed does not write "likes"
          forty times — so the accessible name has to carry the word. Not an
          aria-label: that would REPLACE the count rather than include it, and a
          reader would hear "Like, pressed" with no idea how many.
          tabular-nums so the row does not shift a pixel when 9 becomes 10. */}
      <span aria-hidden="true" className="tabular-nums">
        {state.count > 0 ? state.count : ""}
      </span>
      <span className="sr-only">
        {state.liked ? C.postUnlikeLabel : C.postLikeLabel} — {C.postLikeCount(state.count)}
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
      <path
        d="M20 12a7 7 0 0 1-7 7H8l-4 3v-4.5A7 7 0 0 1 11 5h2a7 7 0 0 1 7 7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
