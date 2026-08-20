"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";

const C = DRAFT_COPY.app;

export interface RoomTab {
  readonly id: string;
  readonly title: string;
  readonly unread: boolean;
}

/**
 * The rooms, along the top of every room screen.
 *
 * They were a page of five identical cards you had to go back to in order to
 * reach any other one — so moving between rooms cost two navigations, and the
 * room you were in was invisible from the room you were reading. A bar makes
 * every room one press from every other and shows where you are while you are
 * there.
 *
 * A client component for the same reason NavLinks is: a layout is a Server
 * Component and cannot read the pathname, and without it nothing marks the
 * current tab — visually, or to a screen reader listing the navigation.
 *
 * Horizontal and scrollable rather than wrapped. Five rooms fit a laptop and do
 * not fit a phone, and a bar that wraps to three lines has stopped being a bar.
 * -mx-6/px-6 lets it bleed to the edges, so a half-cut tab is what says there
 * is more — which no scrollbar on a phone ever will.
 */
export function RoomTabs({ rooms }: { rooms: readonly RoomTab[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label={C.roomsHeading} className="-mx-6 border-b border-line px-6">
      {/* scroll-shadows-x carries the overflow, hides the bar, and puts a
          shadow at whichever edge still has tabs behind it — see globals.css.
          A scrollbar under a five-item nav is a scrollbar on a phone that is
          either invisible or in the way, and neither of those says there is
          more to the right. */}
      <ul className="scroll-shadows-x flex snap-x gap-1">
        {rooms.map((room) => {
          const href = `/app/rooms/${room.id}`;
          const current = pathname === href;

          return (
            <li key={room.id} className="snap-start">
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={`ease-brand flex min-h-tap items-center whitespace-nowrap border-b-2 px-3 text-[13px] transition-colors duration-200 ${
                  current
                    ? "border-accent text-ink"
                    : "border-transparent text-ink-2 hover:text-ink"
                }`}
              >
                {room.title}

                {/* Not on the room you are looking at: you are reading it, so
                    saying it has something unread is a marker arguing with the
                    page under it. */}
                {room.unread && !current ? (
                  <>
                    <span aria-hidden="true" className="ml-2 size-1.5 rounded-full bg-accent" />
                    <span className="sr-only"> — {C.roomUnread}</span>
                  </>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
