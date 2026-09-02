"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={current ? "page" : undefined}
              className={`ease-brand flex min-h-tap items-center border-b-2 px-2.5 text-[13px] transition-colors duration-300 ${
                current ? "border-accent text-ink" : "border-transparent text-ink-2 hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </>
  );
}
