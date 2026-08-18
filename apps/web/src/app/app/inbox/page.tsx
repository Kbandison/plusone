import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";
import { fuse } from "@plusone/logic";

import { getServerSupabase } from "@/lib/supabase";
import { AcceptForm, DeclineForm } from "./inbox-forms";

const C = DRAFT_COPY.app;

export const metadata: Metadata = { title: C.navInbox };

interface ConnectRow {
  id: string;
  prompt_reply: string;
  created_at: string;
  expires_at: string;
  initiator_id: string;
  target_id: string;
  status: string;
}

interface ChatRow {
  id: string;
  status: string;
  fuse_expires_at: string | null;
  updated_at: string;
  connect_id: string;
}

/**
 * Everything that is a person, in one place.
 *
 * These were two sections. Decision #14 describes ONE pipeline — "Inbox model,
 * no swiping. Connect = reply to a specific prompt. Recipient accepts (chat
 * opens) or declines" — and splitting it across two screens meant accepting a
 * connect made the row VANISH: gone from one tab, appearing under another, with
 * nothing on screen joining them. The strongest argument against the split was
 * never that two nav entries is one too many, it was that the transition was
 * invisible.
 *
 * The order is what needs the member first. Requests expire and somebody is
 * waiting on an answer (#14 — no interaction ends in silence); conversations
 * are already underway.
 *
 * The two clocks stay distinct on purpose. A connect's expiry means "answer
 * this"; a chat's fuse means "meet or it closes kindly" (#13). Collapsing them
 * into one "time left" is the one way merging these could do harm.
 */
export default async function InboxPage() {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");
  const me = auth.user.id;

  const [{ data: connectData }, { data: chatData }] = await Promise.all([
    supabase
      .from("connects")
      .select("id, prompt_reply, created_at, expires_at, initiator_id, target_id, status")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("chats")
      .select("id, status, fuse_expires_at, updated_at, connect_id")
      .order("updated_at", { ascending: false }),
  ]);

  const connects = (connectData ?? []) as ConnectRow[];
  const incoming = connects.filter((r) => r.target_id === me);
  const outgoing = connects.filter((r) => r.initiator_id === me);
  const chats = (chatData ?? []) as ChatRow[];
  const now = Date.now();

  // Who each chat is with.
  //
  // Two round trips for the whole list rather than one per row. The name comes
  // from visible_profiles, so someone who has since blocked you or left dating
  // simply has no name here rather than leaking one — the row falls back to its
  // status, which is what it always said.
  const { data: chatConnects } = chats.length
    ? await supabase
        .from("connects")
        .select("id, initiator_id, target_id")
        .in(
          "id",
          chats.map((chat) => chat.connect_id),
        )
    : { data: [] };

  const otherByConnect = new Map(
    (chatConnects ?? []).map((row) => [
      row.id as string,
      ((row.initiator_id as string) === me ? row.target_id : row.initiator_id) as string,
    ]),
  );

  const otherIds = [...new Set([...otherByConnect.values()])];
  const { data: profiles } = otherIds.length
    ? await supabase.from("visible_profiles").select("id, display_name").in("id", otherIds)
    : { data: [] };

  const nameById = new Map(
    (profiles ?? []).map((row) => [row.id as string, row.display_name as string]),
  );
  const nameFor = (chat: ChatRow) =>
    nameById.get(otherByConnect.get(chat.connect_id) ?? "") ?? null;

  const statusLabel = (status: string) =>
    status === "date_planned"
      ? C.datePlannedLabel
      : status === "open"
        ? "Open"
        : C.closedNoteHeading;

  const nothingAtAll = incoming.length === 0 && outgoing.length === 0 && chats.length === 0;

  return (
    <main id="main">
      <h1 className="text-h2">{C.inboxHeading}</h1>

      {/* One empty state, not three. Three separate "nothing here" lines read as
          three broken sections rather than as a quiet evening. */}
      {nothingAtAll ? <p className="mt-8 text-[16px] text-ink-2">{C.inboxAllEmpty}</p> : null}

      {incoming.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-[13px] tracking-[0.04em] text-ink-3 uppercase">
            {C.needsYouHeading}
          </h2>
          <ul className="mt-4 flex flex-col gap-5">
            {incoming.map((connect) => (
              <li
                key={connect.id}
                className="flex flex-col gap-4 rounded-xl border border-line-2 bg-surface p-6"
              >
                {/* The reply to a prompt is the whole of a connect (Decision
                    #14). No name, no photo — you decide on what they said.
                    Which makes it the only thing that tells these apart, so the
                    controls point at it: every Accept and Decline is otherwise
                    identically named, and accepting the wrong one cannot be
                    undone. */}
                <p id={`reply-${connect.id}`} className="text-[16px] leading-[1.65]">
                  {connect.prompt_reply}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <AcceptForm connectId={connect.id} describedBy={`reply-${connect.id}`} />
                  <DeclineForm connectId={connect.id} describedBy={`reply-${connect.id}`} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {chats.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-[13px] tracking-[0.04em] text-ink-3 uppercase">
            {C.conversationsHeading}
          </h2>
          {/* The fuse is visible on every row (§7.2). A timer you have to go
              looking for is a deadline that surprises people, and the whole
              point of the fuse is that nobody is left wondering. */}
          <ul className="mt-4 flex flex-col gap-3">
            {chats.map((chat) => {
              const countdown = fuse.countdown(
                {
                  status: chat.status as never,
                  fuseExpiresAt: chat.fuse_expires_at ? Date.parse(chat.fuse_expires_at) : null,
                  plan: null,
                  closure: null,
                },
                now,
              );

              return (
                <li key={chat.id}>
                  <Link
                    href={`/app/chats/${chat.id}`}
                    className="ease-brand flex items-center justify-between rounded-xl border border-line-control bg-surface px-6 py-5 transition-colors duration-200 hover:border-ink-3"
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[16px]">
                        {nameFor(chat) ?? statusLabel(chat.status)}
                      </span>
                      {nameFor(chat) ? (
                        <span className="text-[13.5px] text-ink-3">{statusLabel(chat.status)}</span>
                      ) : null}
                    </span>

                    {countdown.isRunning ? (
                      <span
                        className={`text-[14px] ${countdown.isExpiringSoon ? "text-caution" : "text-ink-3"}`}
                      >
                        {countdown.isExpiringSoon
                          ? C.fuseExpiringSoon
                          : C.fuseDaysLeft(countdown.remainingDays)}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {outgoing.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-[13px] tracking-[0.04em] text-ink-3 uppercase">
            {C.inboxSentHeading}
          </h2>
          <ul className="mt-4 flex flex-col gap-3">
            {outgoing.map((connect) => (
              <li key={connect.id} className="rounded-lg border border-line px-5 py-4">
                <p className="text-[15px] text-ink-2">{connect.prompt_reply}</p>
                <p className="mt-2 text-[13.5px] text-ink-3">
                  {C.connectExpires(new Date(connect.expires_at).toLocaleDateString())}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
