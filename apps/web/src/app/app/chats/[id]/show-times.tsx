"use client";

import { useState } from "react";

import { DRAFT_COPY } from "@plusone/config";

const C = DRAFT_COPY.app;

/**
 * Timestamps, hidden until asked for.
 *
 * The only client-side part of the thread. The bubbles stay server-rendered —
 * a voice note mints its signed URL during the render and cannot cross to the
 * browser — so this toggles a data attribute on a wrapper and the times style
 * themselves off it.
 *
 * One control for the whole thread rather than a press per bubble. Making each
 * bubble its own button put fifty tab stops in a conversation and took the
 * text out of a plain selection, which is a lot to pay for a time that is
 * already in the markup for anyone who asks their reader for it.
 */
export function ShowTimes({ children }: { children: React.ReactNode }) {
  const [on, setOn] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOn((was) => !was)}
        aria-pressed={on}
        className="ease-brand mt-6 self-start text-[11px] text-ink-3 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
      >
        {on ? C.hideTimesLabel : C.showTimesLabel}
      </button>

      {/* The group the times below hang off. Never aria-hidden when off: the
          time is real information, and the member who cannot see the layout is
          the last one who should lose it. */}
      <div className="group" data-times={on ? "on" : "off"}>
        {children}
      </div>
    </>
  );
}
