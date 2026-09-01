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
  { href: "/app/settings/notifications", label: C.settingsNotifications },
  { href: "/app/settings/safety", label: C.settingsSafety },
  { href: "/app/settings/premium", label: C.premiumHeading },
  /**
   * A fifth tab, added for the closed beta, and the comment above already warns
   * that four is where the horizontal scroll starts to matter on a narrow
   * phone. That cost is accepted rather than unnoticed: during a beta the most
   * valuable thing a member can do is tell us something is broken, and a route
   * nobody can find collects nothing.
   *
   * It carries no `from` parameter, so a report filed from here records no
   * screen — which is correct. They navigated to it, so wherever they were is
   * not where the bug was.
   */
  { href: "/app/feedback", label: C.feedbackTab },
] as const;

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label={C.settingsHeading} className="-mx-6 border-b border-line px-6">
      {/* Same bar as the rooms, down to the edge-to-edge bleed. Four tabs is
          where the horizontal scroll starts to matter on a narrow phone, which
          is what snap-x and the scroll shadows are for — a settings section
          that looked like a different kind of navigation from the rooms one
          would be two answers to one question. */}
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
