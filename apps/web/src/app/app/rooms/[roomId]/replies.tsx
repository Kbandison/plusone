"use client";

import { useState } from "react";

import { DRAFT_COPY } from "@plusone/config";

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
export function Replies({ count, children }: { count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  if (count === 0) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className="ease-brand flex min-h-tap items-center gap-2 text-[11.5px] text-ink-2 transition-colors duration-200 hover:text-ink"
      >
        <span
          aria-hidden="true"
          className={`ease-brand inline-block text-ink-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        >
          ›
        </span>
        {open ? C.postHideReplies : C.postShowReplies(count)}
      </button>

      {open ? <ul className="rise-in">{children}</ul> : null}
    </div>
  );
}
