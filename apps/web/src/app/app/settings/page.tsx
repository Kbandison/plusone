import type { Metadata } from "next";

import { DRAFT_COPY } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";
import { signOut } from "./sign-out";
import { CrossCommunityToggle, DeleteAccount, SignInEmail } from "./settings-forms";
import { InstallApp } from "./install-app";
import { buttonClass } from "@/app/ui";
import { redirect } from "next/navigation";
import Link from "next/link";

export const metadata: Metadata = { title: DRAFT_COPY.app.navSettings };

export default async function SettingsPage() {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const [{ data: profile }, { data: deletion }, { data: isAdmin }] = await Promise.all([
    supabase.from("profiles").select("cross_community_opt_in").eq("id", auth.user.id).maybeSingle(),
    supabase
      .from("deletion_requests")
      .select("purge_after, status")
      .eq("user_id", auth.user.id)
      .maybeSingle(),
    // No argument: is_admin() answers only about the caller, so the roster
    // cannot be probed. See 20260814001000_self_relative_predicates.sql.
    supabase.rpc("is_admin"),
  ]);

  return (
    <main id="main">
      <h1 className="text-h2">{DRAFT_COPY.app.settingsHeading}</h1>

      <CrossCommunityToggle optIn={Boolean(profile?.cross_community_opt_in)} />

      {/* §7.4 puts the referral screen inside Settings. Subscription
          management is the tab next to this one now, rather than a card whose
          only content was a link to it. */}
      <section className="mt-10 rounded-xl border border-line-2 bg-surface p-6">
        <h2 className="text-[0.972rem]">{DRAFT_COPY.app.inviteSettingsHeading}</h2>
        <p className="mt-3 text-[12.2px] leading-[1.65] text-ink-2">
          {DRAFT_COPY.app.inviteSettingsBody}
        </p>
        <Link href="/app/invite" className={buttonClass("secondary", "mt-5 inline-block")}>
          {DRAFT_COPY.app.inviteSettingsLink}
        </Link>
      </section>

      {/* The way into the moderation surface, for the people who have one.
          It has existed since Milestone 3 and nothing in the app linked to it:
          the only way in was typing /admin, and the only way to know that was
          to have written it.

          A link, not a wall. The admin layout turns a non-admin away at the
          door and every RPC underneath checks is_admin() itself and raises —
          this only decides whether the door is visible. */}
      {isAdmin ? (
        <section className="mt-10 rounded-xl border border-line-2 bg-surface p-6">
          <h2 className="text-[0.972rem]">{DRAFT_COPY.app.adminSettingsHeading}</h2>
          <p className="mt-3 text-[12.2px] leading-[1.65] text-ink-2">
            {DRAFT_COPY.app.adminSettingsBody}
          </p>
          <Link href="/admin" className={buttonClass("secondary", "mt-5 inline-block")}>
            {DRAFT_COPY.app.adminSettingsLink}
          </Link>
        </section>
      ) : null}

      {/* Installing is about the app shell rather than about notifications —
          it opens on its own, out of the browser — so it stays here while the
          push switch has moved to the Notifications tab beside its forty-two
          others. The one fact it carried that the push control needs, that a
          lock screen shows the web address whether or not the app is
          installed, is in pushPrivacyNote as well. */}
      <InstallApp />

      <SignInEmail
        email={auth.user?.email ?? null}
        confirmed={Boolean(auth.user?.email_confirmed_at)}
      />

      {/* A button, not a card.
          It was a bordered panel with a title and a sentence explaining what
          signing out is — the most ordinary control in the app, given the same
          weight as the block list. At the bottom because that is where you
          leave from, and above deletion rather than beside it: they are next to
          each other only in the sense that both end a session, and one of them
          ends rather more than that. */}
      <form action={signOut} className="mt-12 flex justify-center">
        <button type="submit" className={buttonClass("secondary")}>
          {DRAFT_COPY.app.signOutLabel}
        </button>
      </form>

      {deletion?.status === "requested" ? (
        <section className="mt-10 rounded-xl border border-critical/40 bg-surface p-6">
          <h2 className="text-[0.972rem]">{DRAFT_COPY.app.deleteHeading}</h2>
          <p className="mt-4 text-[12.6px] leading-[1.7] text-ink-2">
            Everything will be gone by{" "}
            {new Date(deletion.purge_after as string).toLocaleDateString()}.
          </p>
        </section>
      ) : (
        <DeleteAccount />
      )}
    </main>
  );
}
