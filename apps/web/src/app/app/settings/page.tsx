import type { Metadata } from "next";

import { DRAFT_COPY } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";
import { UnblockButton } from "@/app/app/safety/safety-controls";
import { CrossCommunityToggle, DeleteAccount } from "./settings-forms";

export const metadata: Metadata = { title: DRAFT_COPY.app.navSettings };

export default async function SettingsPage() {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();

  const [{ data: profile }, { data: deletion }, { data: blocked }] = await Promise.all([
    supabase
      .from("profiles")
      .select("cross_community_opt_in")
      .eq("id", auth.user!.id)
      .maybeSingle(),
    supabase
      .from("deletion_requests")
      .select("purge_after, status")
      .eq("user_id", auth.user!.id)
      .maybeSingle(),
    // Names are deliberately not resolved. A blocked member is invisible
    // through visible_profiles by construction, and reaching around that to
    // show their name here would be the one place the block does not hold.
    supabase
      .from("blocks")
      .select("blocked_id, created_at")
      .eq("blocker_id", auth.user!.id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <main id="main">
      <h1 className="text-[clamp(1.9rem,5.5vw,2.4rem)]">{DRAFT_COPY.app.settingsHeading}</h1>

      <CrossCommunityToggle optIn={Boolean(profile?.cross_community_opt_in)} />

      <section className="mt-10 rounded-xl border border-line-2 bg-surface p-6">
        <h2 className="text-[1.2rem]">{DRAFT_COPY.app.blockedHeading}</h2>
        {(blocked ?? []).length === 0 ? (
          <p className="mt-4 text-[15px] text-ink-2">{DRAFT_COPY.app.blockedEmpty}</p>
        ) : (
          <ul className="mt-5 flex flex-col gap-3">
            {(blocked ?? []).map((row) => (
              <li
                key={row.blocked_id as string}
                className="flex items-center justify-between gap-4 border-b border-line pb-3 last:border-0"
              >
                <span className="text-[14.5px] text-ink-2">
                  Blocked {new Date(row.created_at as string).toLocaleDateString()}
                </span>
                <UnblockButton memberId={row.blocked_id as string} />
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
