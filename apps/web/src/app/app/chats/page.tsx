import type { Metadata } from "next";
import Link from "next/link";

import { DRAFT_COPY } from "@plusone/config";
import { fuse } from "@plusone/logic";

import { getServerSupabase } from "@/lib/supabase";

export const metadata: Metadata = { title: DRAFT_COPY.app.navChats };

const C = DRAFT_COPY.app;

interface ChatRow {
  id: string;
  status: string;
  fuse_expires_at: string | null;
  updated_at: string;
  connect_id: string;
}

/**
 * The chat list.
 *
 * The fuse is visible on every row (§7.2). A timer you have to go looking for
 * is a deadline that surprises people, and the whole point of the fuse is that
 * nobody is left wondering.
 */
export default async function ChatsPage() {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user!.id;

  const { data } = await supabase
    .from("chats")
    .select("id, status, fuse_expires_at, updated_at, connect_id")
    .order("updated_at", { ascending: false });

  const chats = (data ?? []) as ChatRow[];
  const now = Date.now();

  // Who each chat is with.
  //
  // Every row said "Open" and a countdown, so three open chats were three
  // identical rows — not just to a screen reader reading "Open, Open, Open",
  // but on screen, where a member had no way to tell which conversation they
  // were about to open.
  //
  // Two round trips for the whole list rather than one per row. The name comes
  // from visible_profiles, so someone who has since blocked you or left dating
  // simply has no name here rather than leaking one — the row falls back to its
  // status, which is what it always said.
  const { data: connects } = chats.length
    ? await supabase
        .from("connects")
        .select("id, initiator_id, target_id")
        .in(
          "id",
          chats.map((chat) => chat.connect_id),
        )
    : { data: [] };

  const otherByConnect = new Map(
    (connects ?? []).map((row) => [
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

  return (
    <main id="main">
      <h1 className="text-h2">{C.chatsHeading}</h1>

      {chats.length === 0 ? (
        <p className="mt-8 text-[16px] text-ink-2">{C.chatsEmpty}</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
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
                      {nameFor(chat) ??
                        (chat.status === "date_planned"
                          ? C.datePlannedLabel
                          : chat.status === "open"
                            ? "Open"
                            : C.closedNoteHeading)}
                    </span>
                    {nameFor(chat) ? (
                      <span className="text-[13.5px] text-ink-3">
                        {chat.status === "date_planned"
                          ? C.datePlannedLabel
                          : chat.status === "open"
                            ? "Open"
                            : C.closedNoteHeading}
                      </span>
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
      )}
    </main>
  );
}
