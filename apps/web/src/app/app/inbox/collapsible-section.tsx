"use client";

import { useState } from "react";

/**
 * A section of the inbox that folds away, with its count on the outside.
 *
 * Two of these now — the connects you are waiting on and the threads that have
 * ended — and both are the same argument: neither is a task. A sent connect
 * cannot be acted on and a closed chat is over, so a column of either pushes
 * the threads a member actually has onto the second screen, and the list stops
 * answering "which of these is mine to do".
 *
 * Folded, not deleted and not on another page. §6.2's whole argument is that an
 * ending is something you can go back and look at, and what you wrote to
 * somebody is the one thing you might want to check while waiting.
 *
 * The count lives in the summary so the section says how much is behind it
 * before it is opened. That is also why this is a button rather than a plain
 * <details>: Safari announces a <summary> with mixed content inconsistently,
 * and the count is the part it drops.
 */
export function CollapsibleSection({
  heading,
  count,
  defaultOpen = false,
  children,
}: {
  heading: string;
  count: number;
  /** Open on arrival, for a section a member is more likely to want. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="mt-8">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          /* text-[25px] on an h2, so it is the serif at a heading's size —
             globals.css gives h1..h4 Instrument Serif, which is what makes
             these read as sections rather than as three more controls. */
          className="ease-brand flex w-full items-center gap-2.5 text-left text-[25px] text-ink transition-colors duration-200 hover:opacity-80"
        >
          <span
            aria-hidden="true"
            className={`ease-brand inline-block text-[19px] text-ink-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          >
            ›
          </span>
          {heading}
          {/* Smaller than the heading it belongs to. At the same size it reads
              as part of the title rather than as a count of what is inside. */}
          <span className="text-[15px] text-ink-3 tabular-nums">{count}</span>
        </button>
      </h2>

      {open ? <div className="rise-in mt-3">{children}</div> : null}
    </section>
  );
}
