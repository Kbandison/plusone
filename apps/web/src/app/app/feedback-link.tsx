"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";

/**
 * The way to say something is broken, from wherever it broke.
 *
 * ── why this is a client component for one string ───────────────────────────
 *
 * It carries `?from=` — the screen the member was actually on. Without it the
 * report records `/app/feedback`, which is the one value that cannot possibly
 * be where the bug was: always populated, always wrong, and worse than empty
 * because nobody would think to distrust it.
 *
 * A layout is a Server Component and cannot read the pathname, which is the
 * same reason SettingsTabs and RoomTabs are client components. The settings tab
 * deliberately does NOT pass one — somebody who navigated to Settings and then
 * to Feedback is no longer anywhere near the bug.
 *
 * ── and why it is in the header rather than the bottom bar ──────────────────
 *
 * The layout's own note explains the bar: five items a member goes to in order
 * to DO the thing the app is for. This is not one of those, and it is the same
 * argument that put Settings and the bell up here. During the closed beta it
 * earns the corner; whether it keeps it afterwards is a real question and
 * BACKLOG server 22 is where reopening gets decided.
 */
export function FeedbackLink() {
  const pathname = usePathname();

  return (
    <Link
      href={`/app/feedback?from=${encodeURIComponent(pathname)}`}
      aria-label={DRAFT_COPY.app.feedbackLabel}
      className="ease-brand flex size-tap items-center justify-center rounded-lg text-ink-2 transition-colors duration-300 hover:text-ink"
    >
      <SpeechIcon />
    </Link>
  );
}

/** Drawn rather than imported, like the other two. */
function SpeechIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="size-[21px]">
      <path
        d="M4.5 6.5A2 2 0 0 1 6.5 4.5h11a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-4 3.5v-3.5h-1.5a2 2 0 0 1-2-2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
