import type { Metadata } from "next";

import { DRAFT_COPY } from "@plusone/config";

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

  return (
    <main id="main">
      <h1 className="text-h2">{DRAFT_COPY.app.settingsHeading}</h1>

      <CrossCommunityToggle optIn={Boolean(profile?.cross_community_opt_in)} />

      {/* §7.4 puts the referral screen and subscription management inside
          Settings. They sit above signing out because they are things a member
          might want, not things they do on the way out. */}
      <section className="mt-10 rounded-xl border border-line-2 bg-surface p-6">
        <h2 className="text-[1.2rem]">{DRAFT_COPY.app.premiumSettingsHeading}</h2>
        <p className="mt-3 text-[15px] leading-[1.65] text-ink-2">
          {DRAFT_COPY.app.premiumSettingsBody}
        </p>
        <Link href="/app/premium" className={buttonClass("secondary", "mt-5 inline-block")}>
          {DRAFT_COPY.app.premiumSettingsLink}
        </Link>
      </section>

      <section className="mt-10 rounded-xl border border-line-2 bg-surface p-6">
        <h2 className="text-[1.2rem]">{DRAFT_COPY.app.inviteSettingsHeading}</h2>
        <p className="mt-3 text-[15px] leading-[1.65] text-ink-2">
          {DRAFT_COPY.app.inviteSettingsBody}
        </p>
        <Link href="/app/invite" className={buttonClass("secondary", "mt-5 inline-block")}>
          {DRAFT_COPY.app.inviteSettingsLink}
        </Link>
      </section>

      {/* Above the block list and well above deletion. Signing out is the
          ordinary thing; deleting is not, and they should not sit together. */}
      <section className="mt-10 rounded-xl border border-line-2 bg-surface p-6">
        <h2 className="text-[1.2rem]">{DRAFT_COPY.app.signOutHeading}</h2>
        <p className="mt-3 text-[15px] leading-[1.65] text-ink-2">{DRAFT_COPY.app.signOutBody}</p>
        <form action={signOut} className="mt-5">
          <button type="submit" className={buttonClass("secondary")}>
            {DRAFT_COPY.app.signOutLabel}
          </button>
        </form>
      </section>

      {/* Next to signing out, because both are about getting in and out
          rather than about who can see you. */}
      <SignInEmail
        email={auth.user?.email ?? null}
        confirmed={Boolean(auth.user?.email_confirmed_at)}
      />

      <section className="mt-10 rounded-xl border border-line-2 bg-surface p-6">
        <h2 className="text-[1.2rem]">{DRAFT_COPY.app.blockedHeading}</h2>
        {blocked.length === 0 ? (
          <p className="mt-4 text-[15px] text-ink-2">{DRAFT_COPY.app.blockedEmpty}</p>
        ) : (
          <ul className="mt-5 flex flex-col gap-3">
            {blocked.map((row) => (
              <li
                key={row.blocked_id}
                id={`blocked-${row.blocked_id}`}
                className="flex items-center justify-between gap-4 border-b border-line pb-3 last:border-0"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px]">{row.display_name}</span>
                  <span className="text-[13.5px] text-ink-3">
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

      {deletion?.status === "requested" ? (
        <section className="mt-10 rounded-xl border border-critical/40 bg-surface p-6">
          <h2 className="text-[1.2rem]">{DRAFT_COPY.app.deleteHeading}</h2>
          <p className="mt-4 text-[15.5px] leading-[1.7] text-ink-2">
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
