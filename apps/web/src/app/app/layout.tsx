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

const NAV: { href: string; label: string; datingOnly?: boolean }[] = [
  { href: "/app", label: DRAFT_COPY.app.navHome },
  // Hidden from a support-only member: Browse is a dating surface (Decision #17)
  // and they get the Preview Drop instead (#19). The page redirects too — this
  // only stops the link existing, so nobody is bounced by their own nav.
  { href: "/app/browse", label: DRAFT_COPY.app.navBrowse, datingOnly: true },
  { href: "/app/inbox", label: DRAFT_COPY.app.navInbox },
  { href: "/app/chats", label: DRAFT_COPY.app.navChats },
  { href: "/app/rooms", label: DRAFT_COPY.app.navRooms },
  { href: "/app/invite", label: DRAFT_COPY.app.navInvite },
  { href: "/app/profile", label: DRAFT_COPY.app.navProfile },
  { href: "/app/premium", label: DRAFT_COPY.app.navPremium },
  { href: "/app/settings", label: DRAFT_COPY.app.navSettings },
];

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
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[680px] flex-col px-6">
      <header className="flex items-baseline justify-between py-7">
        <Wordmark className="text-[26px]" />
      </header>

      {/* Clears the nav, which is two rows on a narrow screen. */}
      <div className="flex-1 pb-36 sm:pb-28">{children}</div>

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
        <ul className="mx-auto flex max-w-[680px] flex-wrap items-center justify-center gap-x-1 gap-y-0.5 px-4 py-1.5 sm:justify-between sm:gap-x-0 sm:px-6">
          {/* A client component, only so it can read the pathname. Nine links
              rendered identically with no aria-current anywhere, so nothing
              said which section you were in. */}
          <NavLinks items={nav} />
        </ul>
      </nav>
    </div>
  );
}
