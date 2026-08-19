"use client";

import { useEffect, useRef, useState } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { MoreIcon } from "./chat-icons";

const C = DRAFT_COPY.app;

/**
 * Close, report and block, folded into the header.
 *
 * They were three controls stacked under the composer, which put ending the
 * conversation in the same column as continuing it — and gave the two a member
 * should almost never need the same weight as the message box.
 *
 * Collapsed, because the argument for keeping them reachable is not an argument
 * for keeping them in view: "always reachable, never prominent" was already the
 * comment above them. Behind one press is reachable; three buttons under the
 * thing you came here to do is prominent.
 */
export function ChatMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  // Closing on an outside press and on Escape, because a menu that can only be
  // dismissed by the button that opened it is a trap on a phone — the obvious
  // gesture is to tap away from it.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-label={C.chatMenuLabel}
        className="ease-brand flex size-tap items-center justify-center rounded-lg text-ink-3 transition-colors duration-200 hover:text-ink"
      >
        <MoreIcon />
      </button>

      {open ? (
        // One item per row, ruled off from the next. Report and block were a
        // horizontal pair, which read as a toolbar rather than a list and put
        // two different-weight actions on the same line.
        //
        // Wide enough, and scrollable, because these are not links: each opens
        // a form in place — the closure note carries five radio options and a
        // text field — and a 232px popover clipped them.
        <div className="rise-in absolute right-0 z-20 mt-1 max-h-[70vh] w-[min(84vw,320px)] divide-y divide-line overflow-y-auto rounded-xl border border-line-2 bg-surface px-4 shadow-lg">
          {children}
        </div>
      ) : null}
    </div>
  );
}
