"use client";

import { useState } from "react";

import { DRAFT_COPY } from "@plusone/config";

const C = DRAFT_COPY.app;

/**
 * Endings, folded away.
 *
 * A closed chat is not a task. Left in the main list they accumulate forever
 * and push the two threads a member actually has onto the second screen — the
 * list stops answering "which of these is mine to do", which is the only
 * question it exists to answer.
 *
 * Not deleted, and not on another page: what happened is still theirs to read,
 * and §6.2's whole argument is that an ending is a thing you can go back and
 * look at rather than a row that vanishes.
 *
 * A plain <details> would have been fewer lines and no state. It is a button
 * because the count has to sit in the summary, and Safari announces a <summary>
 * with mixed content inconsistently enough that the count is the part it drops.
 */
export function ClosedSection({ count, children }: { count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-10">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          className="ease-brand flex w-full items-center gap-2 border-t border-line pt-4 text-left text-[12.2px] text-ink-3 transition-colors duration-200 hover:text-ink"
        >
          <span
            aria-hidden="true"
            className={`ease-brand inline-block transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          >
            ›
          </span>
          {C.inboxClosedHeading}
          <span className="text-ink-3 tabular-nums">{C.inboxClosedCount(count)}</span>
        </button>
      </h2>

      {open ? <div className="rise-in mt-3">{children}</div> : null}
    </section>
  );
}
