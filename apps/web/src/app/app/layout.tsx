import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";
import { onboarding } from "@plusone/logic";

import { STEP_ROUTES, loadFacts } from "@/lib/onboarding";
import { getServerSupabase } from "@/lib/supabase";
import { Wordmark } from "@/app/ui";
import { NavLinks } from "./nav-links";

/**
 * The member app.
 *
 * Never cached and never indexed — every screen is a function of who is asking.
 * Onboarding is enforced here rather than per page: a member who has not
 * finished is sent back to the step they stopped at, so there is no half-signed-up
 * state that can reach a surface.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Plus One", template: "%s · Plus One" },
  description: null,
  robots: { index: false, follow: false },
};

/**
 * The sections §7.4 names, minus the one that is not a destination.
 *
 * Invite and Premium were here too, which made nine items on a bar sized for a
 * phone — and gave the two screens a member opens least the same weight as
 * tonight's Drop. The spec puts both inside Profile & Settings.
 *
 * Chats has folded into Inbox. A connect and the chat it becomes are one
 * thread, and Decision #14 describes one pipeline — accepting used to make the
 * row vanish from one tab and reappear under another with nothing joining them.
 *
 * Settings has moved to the header. It is the one entry that is not somewhere a
 * member goes to DO the thing the app is for: five of these are people, and
 * that was the sixth competing with them for a thumb. A corner is where a
 * settings control is looked for, and it takes a row off the bar on the phones
 * this is used on.
 */
const NAV: { href: string; label: string; datingOnly?: boolean }[] = [
  { href: "/app", label: DRAFT_COPY.app.navHome },
  // Hidden from a support-only member: Browse is a dating surface (Decision #17)
  // and they get the Preview Drop instead (#19). The page redirects too — this
  // only stops the link existing, so nobody is bounced by their own nav.
  { href: "/app/browse", label: DRAFT_COPY.app.navBrowse, datingOnly: true },
  { href: "/app/inbox", label: DRAFT_COPY.app.navInbox },
  { href: "/app/rooms", label: DRAFT_COPY.app.navRooms },
  { href: "/app/profile", label: DRAFT_COPY.app.navProfile },
];

/** Drawn rather than imported: one icon does not justify a dependency. */
function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="size-[21px]">
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M19.4 13a7.7 7.7 0 0 0 0-2l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.3-1-2 3.4L6.6 11a7.7 7.7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(STEP_ROUTES.phone);

  const step = onboarding.resolveStep(await loadFacts(data.user.id));
  if (step !== "done") redirect(STEP_ROUTES[step]);

  const { data: me } = await supabase.rpc("my_profile").maybeSingle<{ mode: string | null }>();
  const supportOnly = me?.mode === "support_only";
  const nav = NAV.filter((item) => !(item.datingOnly && supportOnly));

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[550.8px] flex-col px-6">
      <header className="flex items-center justify-between pt-4 pb-3">
        <Wordmark className="text-[26px]" />

        {/* Labelled, because a gear on its own is a shape. The 44px box is the
            LAYOUT.minTapTarget floor — an 18px icon is not a target. */}
        <Link
          href="/app/settings"
          aria-label={DRAFT_COPY.app.navSettings}
          className="ease-brand -mr-2.5 flex size-tap items-center justify-center rounded-lg text-ink-2 transition-colors duration-200 hover:text-ink"
        >
          <GearIcon />
        </Link>
      </header>

      {/* pt-6 above, so a page's heading is not sitting on the wordmark.
          Here rather than on each page: no page carries a top margin of its own
          today, and the moment one of them does they will disagree.

          pb clears the nav, which is two rows on a narrow screen. */}
      <div className="flex-1 pt-6 pb-36 sm:pb-28">{children}</div>

      {/* Bottom nav: thumb-reachable, and the only chrome on the page.
       *
       * It wraps. Nine labels in `justify-between` came to roughly 360px of
       * text inside the 312px a 360px phone leaves after the gutters, and
       * `body { overflow-x: hidden }` meant the overflow was clipped rather
       * than scrollable — so the last items were simply unreachable, on the
       * only navigation in the app. Nothing said so, because clipping never
       * does.
       *
       * The padding is on the links rather than the list, which is what makes
       * each target 24×24 CSS px (WCAG 2.2 SC 2.5.8). It was on the <ul>, so
       * the tappable area was the bare 13px line box — about 21px tall — with
       * `justify-between` leaving no spacing to claim the exception. That is
       * exactly the one-handed-in-a-hurry case this nav exists for. */}
      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 border-t border-line bg-ground/95 backdrop-blur"
      >
        <ul className="mx-auto flex max-w-[550.8px] flex-wrap items-center justify-center gap-x-1 gap-y-0.5 px-4 py-1.5 sm:justify-between sm:gap-x-0 sm:px-6">
          {/* A client component, only so it can read the pathname. Nine links
              rendered identically with no aria-current anywhere, so nothing
              said which section you were in. */}
          <NavLinks items={nav} />
        </ul>
      </nav>
    </div>
  );
}
