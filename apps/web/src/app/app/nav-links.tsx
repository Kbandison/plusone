"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ICONS } from "./nav-icons";

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
}: {
  items: readonly { href: string; label: string; showLabel?: boolean }[];
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
              aria-label={item.label}
              title={item.label}
              /* min-h-tap still, and it is doing more work than it was. The
               * label carried height; without it the row would collapse to the
               * icon's 22px and fall under the 44px minimum. */
              className={`ease-brand flex min-h-tap flex-col items-center justify-center gap-1 border-b-2 px-1 transition-colors duration-300 ${
                current ? "border-accent text-ink" : "border-transparent text-ink-2 hover:text-ink"
              }`}
            >
              {Icon ? <Icon /> : null}
              {/* Only Tonight, and only because no mark says what it means —
                  see the note on NAV. The others are named to a screen reader
                  by the aria-label above and to everyone else by the drawing. */}
              {item.showLabel || !Icon ? (
                <span className="text-[10.5px] leading-none">{item.label}</span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </>
  );
}
