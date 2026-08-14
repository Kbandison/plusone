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
  const { data } = await supabase
    .from("chats")
    .select("id, status, fuse_expires_at, updated_at")
    .order("updated_at", { ascending: false });

  const chats = (data ?? []) as ChatRow[];
  const now = Date.now();

  return (
    <main id="main">
      <h1 className="text-[clamp(1.9rem,5.5vw,2.4rem)]">{C.chatsHeading}</h1>

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
                  className="ease-brand flex items-center justify-between rounded-xl border border-line-2 bg-surface px-6 py-5 transition-colors duration-200 hover:border-ink-3"
                >
                  <span className="text-[16px]">
                    {chat.status === "date_planned"
                      ? C.datePlannedLabel
                      : chat.status === "open"
                        ? "Open"
                        : C.closedNoteHeading}
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
