import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";
import { onboarding } from "@plusone/logic";

import { STEP_ROUTES, loadFacts } from "@/lib/onboarding";
import { getServerSupabase } from "@/lib/supabase";
import { Wordmark } from "@/app/ui";
import { AppBadge } from "./app-badge";
import { LiveRefresh } from "./live-refresh";
import { NavLinks } from "./nav-links";
import { PublishHeight } from "./publish-height";
import { NativeIapRecovery } from "./native-iap-recovery";
import { NativePush } from "./native-push";
import { ServiceWorker } from "./service-worker";
import { Timezone } from "./timezone";

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

/** The bar PublishHeight measures. One nav, so a constant is enough. */
const NAV_ID = "app-nav";

/** Drawn rather than imported: two icons do not justify a dependency. */
function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="size-[21px]">
      <path
        d="M12 3.5a5.5 5.5 0 0 0-5.5 5.5c0 3.2-.7 5-1.4 6a.8.8 0 0 0 .65 1.25h12.5A.8.8 0 0 0 18.9 15c-.7-1-1.4-2.8-1.4-6A5.5 5.5 0 0 0 12 3.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M10 19a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** Drawn rather than imported: two icons do not justify a dependency. */
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

export default async function AppLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  /**
   * Anything opened over the app. A parallel-route slot, holding the
   * intercepted connect form and `@modal/default.tsx` — which is null — the
   * rest of the time.
   */
  modal: React.ReactNode;
}) {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(STEP_ROUTES.phone);

  const step = onboarding.resolveStep(await loadFacts(data.user.id));
  if (step !== "done") redirect(STEP_ROUTES[step]);

  const [{ data: me }, { data: unreadData }] = await Promise.all([
    supabase.rpc("my_profile").maybeSingle<{ mode: string | null; timezone: string | null }>(),
    // A count rather than the list. The bell is on every screen, and rendering
    // it through my_notifications would fetch fifty rows and their joins on
    // every page load to produce one integer.
    supabase.rpc("my_unread_notifications"),
  ]);
  const unread = Number(unreadData ?? 0);
  const supportOnly = me?.mode === "support_only";
  const nav = NAV.filter((item) => !(item.datingOnly && supportOnly));

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[550.8px] flex-col px-6">
      {/* pt clears the status bar as well as giving the header its own space.
       *
       * The 1rem was the whole of it, and that was right for every surface
       * that existed when it was written. It is wrong in the iOS shell: there,
       * the WKWebView IS the view controller's root view, so the page starts at
       * the physical top of the screen and the wordmark is drawn UNDERNEATH the
       * clock. Verified in the Simulator on an iPhone 17 Pro, where the top
       * inset is 59pt and the header's ink began at 24pt — the two overlap, and
       * "⁺One" comes out as a grey smudge behind the time.
       *
       * Nothing else showed it. A browser tab has Safari's chrome above the
       * page; the installed web app has `statusBarStyle: "default"`, which is
       * the setting that makes iOS start the web view BELOW the status bar
       * (§ the note in the root layout, which chose it for exactly this reason).
       * Both report a top inset of nought, so this calc adds nothing there and
       * the layout is unchanged on every surface but the one that was broken. */}
      <header className="flex items-center justify-between pt-[calc(1rem+env(safe-area-inset-top))] pb-3">
        <Wordmark className="text-[26px]" />

        <div className="flex items-center">
          {/* The way to the list, from every screen.
           *
           * §8's whole matrix delivered to a lock screen and nowhere else: a
           * push dismissed is a thing that happened and cannot be found again.
           * Beside the gear rather than on the bottom bar, because the five
           * items down there are places a member goes to DO the thing the app
           * is for, and this is a record of what has already been done to them.
           *
           * The count is in the label, not only in the badge. A badge is a
           * coloured dot to somebody not looking at it and nothing at all to
           * somebody listening. */}
          <Link
            href="/app/notifications"
            aria-label={DRAFT_COPY.app.notificationsBellLabel(unread)}
            className="ease-brand relative flex size-tap items-center justify-center rounded-lg text-ink-2 transition-colors duration-200 hover:text-ink"
          >
            <BellIcon />
            {unread > 0 ? (
              /* A dot, not a number. §8 keeps count granularity out of
                 notifications, and the same argument holds one layer in: the
                 header is visible over somebody's shoulder, and "11" is a
                 different disclosure from "something". */
              <span
                aria-hidden="true"
                className="absolute top-[9px] right-[9px] size-2 rounded-full border-2 border-ground bg-accent"
              />
            ) : null}
          </Link>

          {/* Labelled, because a gear on its own is a shape. The 44px box is
              the LAYOUT.minTapTarget floor — an 18px icon is not a target. */}
          <Link
            href="/app/settings"
            aria-label={DRAFT_COPY.app.navSettings}
            className="ease-brand -mr-2.5 flex size-tap items-center justify-center rounded-lg text-ink-2 transition-colors duration-200 hover:text-ink"
          >
            <GearIcon />
          </Link>
        </div>
      </header>

      {/* The bell, live, on every screen in the app.
       *
       * INSERT only. Marking the list read is an UPDATE on the same table, so a
       * watch for `*` would hear the notifications page's own bookkeeping and
       * refresh the screen the member is currently reading.
       *
       * Filtered to this member, though "members read their own notifications"
       * would already scope it: without the filter every member is woken by
       * every other member's row and refetches a page they are not looking at.
       */}
      <LiveRefresh
        watch={[{ table: "notifications", filter: `user_id=eq.${data.user.id}`, event: "INSERT" }]}
      />

      {/* Renders nothing. It marks the app's own icon on a home screen, which
          is the one signal that reaches a member who has installed the app and
          declined notifications. A count since 2026-08-26, which is a §8
          decision rather than a detail — see AppBadge. */}
      <AppBadge unread={unread} />

      {/* pt-6 above, so a page's heading is not sitting on the wordmark.
          Here rather than on each page: no page carries a top margin of its own
          today, and the moment one of them does they will disagree.

          pb clears the nav. It was pb-36 — 144px — from when there were nine
          items and the bar wrapped to two rows; five items fit on one, which is
          a 44px link plus 12px of padding and a border. So every screen ended
          in ninety pixels of nothing.

          --nav-h is how tall the bar IS, measured — see PublishHeight. This is
          clearance, which is a different number: a page whose last line ends
          exactly at the top of the nav has not been given room, it has been
          given none. So the bar's height plus a gap, rather than one value
          doing both jobs badly. The composer, which really does want to sit
          flush on top of the bar, uses --nav-h by itself. */}
      <div className="flex-1 pt-6 pb-[calc(var(--nav-h)+1.5rem)]">{children}</div>

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
        /* z-40, because the posts learned to stack.
           A fixed element with z-index: auto loses to any positioned element
           that has one — and the feed rows became `relative z-10` when the
           whole post was made clickable, so they painted straight over the nav.
           Below a dialog by construction: showModal() puts those in the top
           layer, which no z-index can reach. */
        id={NAV_ID}
        /* pb-safe, now that viewport-fit is cover.
           The inset is nought on everything without a home indicator, so this
           costs nothing anywhere else — and on the phones that have one it is
           the difference between a row of links and a row of links underneath
           the bar you swipe up on. */
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ground/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="mx-auto flex max-w-[550.8px] flex-wrap items-center justify-center gap-x-1 gap-y-0.5 px-4 py-1.5 sm:justify-between sm:gap-x-0 sm:px-6">
          {/* A client component, only so it can read the pathname. Nine links
              rendered identically with no aria-current anywhere, so nothing
              said which section you were in. */}
          <NavLinks items={nav} />
        </ul>
      </nav>

      {modal}

      {/* Renders nothing either. It puts the worker on the device that makes
          push and the installed shell possible — see service-worker.tsx. */}
      <ServiceWorker />

      {/* Nothing again, and the other half of the same job. A WebView has no
          PushManager, so the worker above reaches nobody inside the native
          shell — this asks iOS for a device token instead. Each returns
          immediately on the surface the other one serves. */}
      <NativePush />
      {/* Collects a purchase whose grant did not land, and every renewal, both
          of which arrive with no screen involved. Renders nothing. */}
      <NativeIapRecovery />

      {/* Nothing again. Every profile in the database said 'UTC' because
          nothing had ever written the column — so every timestamp in the app
          was rendered in the wrong zone and the 8pm drop landed at 8pm UTC. */}
      <Timezone current={(me?.timezone as string | null) ?? "UTC"} />

      {/* Renders nothing. It measures the bar above and publishes the height,
          because the one thing that has to sit flush on top of it cannot be
          told that number in advance. */}
      <PublishHeight targetId={NAV_ID} cssVar="--nav-h" />
    </div>
  );
}
