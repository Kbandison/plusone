import type { Metadata } from "next";

import { getServerSupabase } from "@/lib/supabase";
import { QueueItem, type FlaggedMember } from "./queue-item";

export const metadata: Metadata = { title: "Verifications" };

export default async function VerificationsPage() {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("admin_flagged_verifications");
  const members = (data ?? []) as FlaggedMember[];

  return (
    <main id="main">
      <h1 className="mt-4 text-[clamp(1.9rem,5vw,2.4rem)]">Flagged verifications</h1>
      <p className="mt-4 max-w-[52ch] text-[16px] leading-[1.7] text-ink-2">
        Members whose automatic check could not decide, oldest first. Manual review happens only on
        a risk flag.
      </p>

      {error ? (
        <p role="alert" className="mt-8 text-[15px] text-critical">
          {error.message}
        </p>
      ) : members.length === 0 ? (
        <p className="mt-10 rounded-lg border border-line-2 bg-surface p-8 text-[16px] text-ink-2">
          Nothing waiting. Every verification decided itself.
        </p>
      ) : (
        <ul className="mt-10 flex flex-col gap-5">
          {members.map((member) => (
            <QueueItem key={member.user_id} member={member} />
          ))}
        </ul>
      )}
    </main>
  );
}
