"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";

const C = DRAFT_COPY.app;

/**
 * The settings sections, along the top of every settings screen.
 *
 * Premium was a page of its own, reached by a card in Settings whose whole
 * content was a heading, a sentence and a link to it — a section pretending to
 * be a section, one navigation away from being one. Now it is a tab, and
 * getting back is a press rather than a Back.
 *
 * Everything else is General for now. Two tabs is thin, and that is the honest
 * shape of it: splitting blocks, email and deletion across four tabs would be
 * filing cabinets for a drawer's worth of settings.
 *
 * A client component for the same reason RoomTabs is: a layout is a Server
 * Component and cannot read the pathname, so without it nothing marks the
 * current tab — visually, or to a screen reader listing the navigation.
 */
const TABS = [
  { href: "/app/settings", label: C.settingsGeneral },
  { href: "/app/settings/premium", label: C.premiumHeading },
] as const;

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label={C.settingsHeading} className="-mx-6 border-b border-line px-6">
      {/* Same bar as the rooms, down to the edge-to-edge bleed: two tabs fit
          anything, but a settings section that looked like a different kind of
          navigation from the rooms one would be two answers to one question. */}
      <ul className="scroll-shadows-x flex snap-x gap-1">
        {TABS.map((tab) => {
          const current = pathname === tab.href;

          return (
            <li key={tab.href} className="snap-start">
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={`ease-brand flex min-h-tap items-center whitespace-nowrap border-b-2 px-3 text-[13px] transition-colors duration-200 ${
                  current
                    ? "border-accent text-ink"
                    : "border-transparent text-ink-2 hover:text-ink"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
