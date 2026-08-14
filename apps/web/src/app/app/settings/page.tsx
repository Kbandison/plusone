import type { Metadata } from "next";

import { DRAFT_COPY } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";
import { CrossCommunityToggle, DeleteAccount } from "./settings-forms";

export const metadata: Metadata = { title: DRAFT_COPY.app.navSettings };

export default async function SettingsPage() {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();

  const [{ data: profile }, { data: deletion }] = await Promise.all([
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
  ]);

  return (
    <main id="main">
      <h1 className="text-[clamp(1.9rem,5.5vw,2.4rem)]">{DRAFT_COPY.app.settingsHeading}</h1>

      <CrossCommunityToggle optIn={Boolean(profile?.cross_community_opt_in)} />

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
