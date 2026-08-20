"use client";

import { useState } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { useReply } from "./reply-context";

const C = DRAFT_COPY.app;

/**
 * The replies under one comment, folded away until asked for.
 *
 * Collapsed by default because a comment with nine replies under it pushes the
 * next comment off the screen, and somebody scrolling the list has not decided
 * to read that sub-conversation yet. Facebook makes the same call for the same
 * reason.
 *
 * The children are server-rendered rows passed straight through — this holds
 * one boolean and nothing else, so nesting costs a state hook per comment and
 * not a second way of building a post.
 */
export function Replies({
  commentId,
  count,
  children,
}: {
  commentId: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Open while this is the comment being answered.
  //
  // Pressing Reply on a comment whose replies are folded away puts the answer
  // somewhere the member cannot see — they write it, it lands, and nothing on
  // screen changes. Aiming at a comment is as clear a statement of interest in
  // its replies as pressing the toggle would be.
  const { replyParentId } = useReply();
  const showing = open || replyParentId === commentId;

  if (count === 0) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={showing}
        className="ease-brand flex min-h-tap items-center gap-2 text-[11.5px] text-ink-2 transition-colors duration-200 hover:text-ink"
      >
        <span
          aria-hidden="true"
          className={`ease-brand inline-block text-ink-3 transition-transform duration-200 ${showing ? "rotate-90" : ""}`}
        >
          ›
        </span>
        {showing ? C.postHideReplies : C.postShowReplies(count)}
      </button>

      {showing ? <ul className="rise-in">{children}</ul> : null}
    </div>
  );
}
