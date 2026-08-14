import type { Metadata } from "next";

import { DRAFT_COPY } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";
import { AcceptForm, DeclineForm } from "./inbox-forms";

export const metadata: Metadata = { title: DRAFT_COPY.app.navInbox };

interface ConnectRow {
  id: string;
  prompt_reply: string;
  created_at: string;
  expires_at: string;
  initiator_id: string;
  target_id: string;
  status: string;
}

export default async function InboxPage() {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user!.id;

  const { data } = await supabase
    .from("connects")
    .select("id, prompt_reply, created_at, expires_at, initiator_id, target_id, status")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as ConnectRow[];
  const incoming = rows.filter((r) => r.target_id === me);
  const outgoing = rows.filter((r) => r.initiator_id === me);

  return (
    <main id="main">
      <h1 className="text-[clamp(1.9rem,5.5vw,2.4rem)]">{DRAFT_COPY.app.inboxHeading}</h1>

      {incoming.length === 0 ? (
        <p className="mt-8 text-[16px] text-ink-2">{DRAFT_COPY.app.inboxEmpty}</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-5">
          {incoming.map((connect) => (
            <li
              key={connect.id}
              className="flex flex-col gap-4 rounded-xl border border-line-2 bg-surface p-6"
            >
              {/* The reply to a prompt is the whole of a connect (Decision #14).
                  No name, no photo — you decide on what they said. */}
              <p className="text-[16px] leading-[1.65]">{connect.prompt_reply}</p>
              <div className="flex flex-wrap items-center gap-3">
                <AcceptForm connectId={connect.id} />
                <DeclineForm connectId={connect.id} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {outgoing.length > 0 ? (
        <section className="mt-14">
          <h2 className="text-[1.25rem]">{DRAFT_COPY.app.inboxSentHeading}</h2>
          <ul className="mt-5 flex flex-col gap-3">
            {outgoing.map((connect) => (
              <li key={connect.id} className="rounded-lg border border-line px-5 py-4">
                <p className="text-[15px] text-ink-2">{connect.prompt_reply}</p>
                <p className="mt-2 text-[13.5px] text-ink-3">
                  Expires {new Date(connect.expires_at).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
