import type { Metadata } from "next";

import { DRAFT_COPY, RETENTION } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";
import { signOut } from "./sign-out";
import { UnblockButton } from "@/app/app/safety/safety-controls";
import { CrossCommunityToggle, DeleteAccount, SignInEmail } from "./settings-forms";
import { buttonClass } from "@/app/ui";
import { redirect } from "next/navigation";
import Link from "next/link";

export const metadata: Metadata = { title: DRAFT_COPY.app.navSettings };

/** One row of the caller's own block list. */
interface BlockedMember {
  readonly blocked_id: string;
  readonly display_name: string;
  readonly created_at: string;
}

export default async function SettingsPage() {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const [{ data: profile }, { data: deletion }, { data: blockedData }] = await Promise.all([
    supabase.from("profiles").select("cross_community_opt_in").eq("id", auth.user.id).maybeSingle(),
    supabase
      .from("deletion_requests")
      .select("purge_after, status")
      .eq("user_id", auth.user.id)
      .maybeSingle(),
    // Names ARE resolved here, and this reverses what the comment used to say.
    //
    // The old reasoning was that a blocked member is invisible through
    // visible_profiles by construction, and reaching around that would be the
    // one place the block does not hold. What it produced was a list of
    // "Blocked 14 August" with an Unblock button beside each — two blocks on
    // one day were indistinguishable, and undoing one was a guess.
    //
    // This is the screen for MANAGING blocks. A safety control you cannot read
    // is a safety control you cannot undo, and the member already knew who this
    // was when they blocked them. my_blocked_members() returns only blocks the
    // caller made, never blocks made against them.
    supabase.rpc("my_blocked_members"),
  ]);

  const blocked = (blockedData ?? []) as BlockedMember[];

  // The threads a block took out of the inbox and this member still may read.
  //
  // No filtering here for who reported whom: may_read_chat already decides
  // that, in the policy, so a chat coming back is a chat the wall has already
  // said yes to. Re-implementing the rule in TypeScript would be a second
  // definition to keep in step with the first.
  const { data: blockedChats } = await supabase
    .from("chats")
    .select("id, connect_id, blocked_at")
    .not("blocked_at", "is", null)
    .order("blocked_at", { ascending: false });

  const reportedThreads = await Promise.all(
    ((blockedChats ?? []) as { id: string; connect_id: string; blocked_at: string }[]).map(
      async (chat) => {
        const { data: connect } = await supabase
          .from("connects")
          .select("initiator_id, target_id")
          .eq("id", chat.connect_id)
          .maybeSingle();
        const other =
          connect?.initiator_id === auth.user?.id ? connect?.target_id : connect?.initiator_id;
        // profiles, not visible_profiles: the block hides them from every
        // dating surface by construction, which would leave this row nameless
        // on the one screen whose whole purpose is telling you which thread it
        // is. The id never reaches the client — only the name does.
        const { data: profile } = other
          ? await supabase.from("profiles").select("display_name").eq("id", other).maybeSingle()
          : { data: null };
        return {
          id: chat.id,
          name: (profile?.display_name as string | null) ?? DRAFT_COPY.app.threadUnknownPerson,
          blockedAt: chat.blocked_at,
        };
      },
    ),
  );

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

      <SignInEmail
        email={auth.user?.email ?? null}
        confirmed={Boolean(auth.user?.email_confirmed_at)}
      />

      <section className="mt-10 rounded-xl border border-line-2 bg-surface p-6">
        <h2 className="text-[0.972rem]">{DRAFT_COPY.app.blockedHeading}</h2>
        {blocked.length === 0 ? (
          <p className="mt-4 text-[12.2px] text-ink-2">{DRAFT_COPY.app.blockedEmpty}</p>
        ) : (
          <ul className="mt-5 flex flex-col gap-3">
            {blocked.map((row) => (
              <li
                key={row.blocked_id}
                id={`blocked-${row.blocked_id}`}
                className="flex items-center justify-between gap-4 border-b border-line pb-3 last:border-0"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-[12.2px]">{row.display_name}</span>
                  <span className="text-[11px] text-ink-3">
                    Blocked {new Date(row.created_at).toLocaleDateString()}
                  </span>
                </span>
                <UnblockButton
                  memberId={row.blocked_id}
                  describedBy={`blocked-${row.blocked_id}`}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* The threads a block took out of the inbox, for the member who reported.
          Here rather than in the inbox on purpose: nothing about reporting
          somebody belongs in the list of people you are talking to. */}
      <section className="mt-10 rounded-xl border border-line-2 bg-surface p-6">
        <h2 className="text-[0.972rem]">{DRAFT_COPY.app.reportedThreadsHeading}</h2>
        {reportedThreads.length === 0 ? (
          <p className="mt-4 text-[12.2px] text-ink-2">{DRAFT_COPY.app.reportedThreadsEmpty}</p>
        ) : (
          <>
            <ul className="mt-5 flex flex-col gap-3">
              {reportedThreads.map((thread) => (
                <li key={thread.id} className="border-b border-line pb-3 last:border-0">
                  <Link
                    href={`/app/chats/${thread.id}`}
                    className="ease-brand flex flex-col gap-0.5 transition-opacity duration-200 hover:opacity-80"
                  >
                    <span className="text-[12.2px]">{thread.name}</span>
                    <span className="text-[11px] text-ink-3">
                      {new Date(thread.blockedAt).toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[11px] text-ink-3">
              {DRAFT_COPY.app.reportedThreadsNote(RETENTION.blockedThreadDays)}
            </p>
          </>
        )}
      </section>

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
