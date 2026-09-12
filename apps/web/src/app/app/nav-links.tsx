"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";

import { NAV_ICONS } from "./nav-icons";

const C = DRAFT_COPY.app;

/**
 * The bottom nav's links, which need to know where you are.
 *
 * A client component only because of that: the layout is a Server Component and
 * cannot read the pathname, so all nine links rendered with an identical class
 * and no `aria-current` anywhere in the codebase. Nothing distinguished the
 * section you were in from the eight you were not — visually, or to a screen
 * reader listing the navigation.
 *
 * The list itself, the nav element and the labels all stay on the server; this
 * is the smallest thing that had to move.
 */
export function NavLinks({
  items,
  counts,
}: {
  items: readonly { href: string; label: string }[];
  /** Unread per href. Absent or zero draws nothing at all. */
  counts?: Readonly<Record<string, number>>;
}) {
  const pathname = usePathname();

  return (
    <>
      {items.map((item) => {
        // /app is only current when it IS /app — every other section lives
        // underneath it, so a prefix test would light up Home on every screen.
        const current = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
        // Falls back to the word for any route without a mark, so adding a
        // sixth section renders something legible rather than an empty tab.
        const Icon = NAV_ICONS[item.href];
        const count = Math.trunc(counts?.[item.href] ?? 0);
        const badge = count > 0;

        return (
          <li key={item.href} className="flex-1">
            <Link
              href={item.href}
              aria-current={current ? "page" : undefined}
              /* The label is the ACCESSIBLE NAME now that it is not drawn.
               *
               * Without this the bar is five unnamed links, which is worse than
               * the words it replaced — a screen reader had a perfectly good nav
               * before. The icons are aria-hidden, so this is the only name each
               * link has. */
              /* The count belongs in the NAME, not only in the picture. A
               * badge a screen reader cannot see is a nav that tells sighted
               * members something it withholds from everybody else — and this
               * is the one part of the bar that changes. */
              aria-label={badge ? C.navUnread(item.label, count) : item.label}
              title={item.label}
              /* min-h-tap still, and it is doing more work than it was. The
               * label carried height; without it the row would collapse to the
               * icon's 22px and fall under the 44px minimum. */
              /* The current tab is the ACCENT, not an underline.
               *
               * It was `border-b-2 border-accent`, which put the only marker
               * below the thing it marked — a rule under a tab, competing with
               * the bar's own top border two pixels away. Colouring the mark and
               * its word says the same thing on the element a thumb is aiming
               * at, and it is the one place the accent is meant to go: the token
               * file's rule is "CTAs, links, highlights, interactive states". */
              className={`ease-brand flex min-h-tap flex-col items-center justify-center gap-1 px-1 transition-colors duration-300 ${
                current ? "text-accent" : "text-ink-2 hover:text-ink"
              }`}
            >
              {/* The badge is positioned against the ICON, not the link.
                  Against the link it would sit in the row's top-right corner,
                  which on a flex-1 tab is a long way from the mark it belongs
                  to — and further on a tablet than a phone, because the tabs
                  grow and the icon does not. */}
              <span className="relative flex">
                {Icon ? <Icon /> : null}
                {badge ? (
                  <>
                    {/* aria-hidden: the number is already in the link's name,
                        and reading it twice is worse than not drawing it. */}
                    <span
                      aria-hidden="true"
                      className="absolute -top-1 -right-2 min-w-[1.05rem] rounded-full bg-accent px-1 text-center text-[9.5px] leading-[1.05rem] font-medium text-accent-ink tabular-nums"
                    >
                      {/* Capped, because three digits stops being a count and
                          starts being a shape — and it would be wider than the
                          mark it sits on. */}
                      {count > 99 ? "99+" : count}
                    </span>
                  </>
                ) : null}
              </span>
              {/* Every tab. Icons READ faster once known and none of the five
                  says what it means to somebody who has not learnt it yet —
                  Tonight least of all, since no mark says "three people, once a
                  day". The word is what makes the drawing learnable. */}
              <span className="text-[10.5px] leading-none">{item.label}</span>
            </Link>
          </li>
        );
      })}
    </>
  );
}
