import type { Metadata } from "next";

import { COPY, INTENTION_LABELS, type Intention } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";
import { ModeToggle } from "./mode-toggle";

export const metadata: Metadata = { title: "You" };

export default async function ProfilePage() {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, intention, mode, search_radius_mi")
    .eq("id", auth.user!.id)
    .maybeSingle();

  const mode = profile?.mode === "support_only" ? "support_only" : "dating";
  const intention = profile?.intention as Intention | null;

  return (
    <main id="main">
      <h1 className="text-[clamp(1.9rem,5.5vw,2.4rem)]">{profile?.display_name ?? "You"}</h1>

      <dl className="mt-8 flex flex-col gap-5">
        <div>
          <dt className="text-[13px] tracking-[0.04em] text-ink-3 uppercase">Looking for</dt>
          <dd className="mt-1.5 text-[16px]">
            {intention ? INTENTION_LABELS[intention] : "Not set"}
          </dd>
          {/* §3.4, verbatim. The lock is what makes the answer mean something. */}
          <dd className="mt-1.5 text-[14px] text-ink-3">{COPY.intention.lockNotice}</dd>
        </div>

        <div>
          <dt className="text-[13px] tracking-[0.04em] text-ink-3 uppercase">Search radius</dt>
          <dd className="mt-1.5 text-[16px]">{profile?.search_radius_mi ?? 50} miles</dd>
        </div>
      </dl>

      <ModeToggle mode={mode} />
    </main>
  );
}
