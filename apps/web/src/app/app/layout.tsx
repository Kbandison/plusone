import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";
import { onboarding } from "@plusone/logic";

import { STEP_ROUTES, loadFacts } from "@/lib/onboarding";
import { getServerSupabase } from "@/lib/supabase";

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

const NAV = [
  { href: "/app", label: DRAFT_COPY.app.navHome },
  { href: "/app/browse", label: DRAFT_COPY.app.navBrowse },
  { href: "/app/inbox", label: DRAFT_COPY.app.navInbox },
  { href: "/app/chats", label: DRAFT_COPY.app.navChats },
  { href: "/app/rooms", label: DRAFT_COPY.app.navRooms },
  { href: "/app/profile", label: DRAFT_COPY.app.navProfile },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(STEP_ROUTES.phone);

  const step = onboarding.resolveStep(await loadFacts(data.user.id));
  if (step !== "done") redirect(STEP_ROUTES[step]);

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[680px] flex-col px-6">
      <header className="flex items-baseline justify-between py-7">
        <Link href="/app" className="font-display text-[26px] leading-none tracking-[-0.02em]">
          <span className="align-super text-[0.42em] text-accent">+</span>One
        </Link>
      </header>

      <div className="flex-1 pb-28">{children}</div>

      {/* Bottom nav: thumb-reachable, and the only chrome on the page. */}
      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 border-t border-line bg-ground/95 backdrop-blur"
      >
        <ul className="mx-auto flex max-w-[680px] justify-between px-6 py-3.5">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="ease-brand text-[13px] text-ink-2 transition-colors duration-200 hover:text-ink"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
