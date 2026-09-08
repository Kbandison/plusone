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
export function NavLinks({ items }: { items: readonly { href: string; label: string }[] }) {
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
              {Icon ? <Icon /> : null}
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
