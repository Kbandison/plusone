import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BETA_WELCOME } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";
import { Checklist } from "./checklist";

export const metadata: Metadata = { title: "Testing" };
export const dynamic = "force-dynamic";

/**
 * The tester's own screen.
 *
 * Not in the bottom nav, deliberately: five tabs are the places a member goes
 * to do the thing the app is for, and this is not one of them. It is reached
 * from the beta welcome, and from Settings.
 *
 * ── the Settings door is a CORRECTION, 2026-09-20 ──────────────────────────
 *
 * This comment used to say the welcome links it and that a tester who wanted it
 * back could reach it through the browser, and both halves were wrong together.
 * The welcome is dismissed permanently the first time it closes, so it links
 * this exactly once — and A SHELL HAS NO ADDRESS BAR, so going back through the
 * browser is not a route a tester in the TWA or the iOS app can take.
 *
 * (Described rather than quoted, because a test refuses the old sentence by
 * name and cannot tell a quotation from a claim.)
 *
 * So for every tester in either shell the checklist became unreachable the
 * moment they pressed "Start looking around". Kevin caught it. It is the same
 * mistake, in the same words, that HANDOFF.md records costing an App Review:
 * reasoning about a shell as though it were a browser tab.
 *
 * ── gated on joined_in_beta, and the redirect is the point ─────────────────
 *
 * Not a permission — there is nothing here worth protecting — but a member who
 * arrived after the beta and stumbled on this URL would be handed a list of
 * chores written for somebody else, telling them the app is expected to be
 * broken. That is a bad first impression bought for nothing.
 */
export default async function BetaPage() {
  const supabase = await getServerSupabase();
  const { data: me } = await supabase
    .rpc("my_profile")
    .maybeSingle<{ joined_in_beta: boolean | null }>();

  if (!me?.joined_in_beta) redirect("/app");

  return (
    <main id="main">
      <h1 className="text-h2">{BETA_WELCOME.checklist.heading}</h1>
      <p className="mt-3 text-body leading-[1.7] text-ink-2">{BETA_WELCOME.opening}</p>

      <Checklist />

      {/* The link, and nothing explaining the storage.
          It read "Ticks are kept on this device only — nothing about what you
          tried is sent to us." Kevin cut it: nobody was wondering, and a screen
          that volunteers what it is NOT doing invites the thought. The ticks
          still never leave the device, which beta-welcome.test.ts holds. */}
      {/* Both ways out, because this screen is a destination now rather than a
          thing the welcome dropped somebody into: one to report what they
          found, one back to the app they are meant to be testing. */}
      <p className="mt-8 text-[12.6px] leading-[1.6] text-ink-3">
        <Link
          href="/app/feedback"
          className="ease-brand text-accent underline decoration-line-2 underline-offset-4 transition-colors duration-300 hover:decoration-accent"
        >
          Tell us what you found
        </Link>
      </p>
    </main>
  );
}
