"use client";

import { useEffect, useRef, useState } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { MoreIcon } from "./chats/[id]/chat-icons";

const C = DRAFT_COPY.app;

/**
 * The things a member should be able to reach and should almost never need.
 *
 * Two callers now, which is why it stopped being ChatMenu: the chat header
 * folds close, report and block behind it, and every post in a room folds
 * report and block behind it. Both are the same argument — "always reachable,
 * never prominent" — and two copies of the outside-press and Escape handling
 * below would be two things to get right.
 *
 * Collapsed, because the argument for keeping them reachable is not an argument
 * for keeping them in view. Behind one press is reachable; three buttons under
 * the thing you came here to do is prominent.
 */
export function OverflowMenu({
  label = C.chatMenuLabel,
  align = "right",
  compact = false,
  trigger,
  children,
}: {
  /** What the trigger is called, where "More" is not specific enough. */
  label?: string;
  /** Which edge the panel hangs from, for a menu near the left of its row. */
  align?: "left" | "right";
  /** A smaller trigger, for a control that sits inside a feed row. */
  compact?: boolean;
  /** What the trigger shows. The three dots unless a caller says otherwise. */
  trigger?: React.ReactNode;
  children: React.ReactNode;
}) {
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
        aria-haspopup="menu"
        aria-label={label}
        /* Still a 44px target when compact — the icon shrinks, the box does
           not. LAYOUT.minTapTarget is a floor and a feed is the surface most
           likely to be used one-handed in a hurry. */
        className={`ease-brand flex size-tap items-center justify-center rounded-lg text-ink-3 transition-colors duration-200 hover:text-ink ${compact ? "-mr-2.5 scale-90" : ""}`}
      >
        {trigger ?? <MoreIcon />}
      </button>

      {open ? (
        // One item per row, ruled off from the next. Report and block were a
        // horizontal pair, which read as a toolbar rather than a list and put
        // two different-weight actions on the same line.
        //
        // Narrow, because nothing opens inside it. Close and report each raise
        // a modal and block asks for a confirmation, so the menu holds three
        // words and needs the width of three words.
        <div
          className={`rise-in absolute z-20 mt-1 w-[232px] divide-y divide-line rounded-xl border border-line-2 bg-surface px-4 shadow-lg ${align === "left" ? "left-0" : "right-0"}`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
