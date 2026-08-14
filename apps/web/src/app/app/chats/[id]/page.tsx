import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DRAFT_COPY, renderClosureTemplate } from "@plusone/config";
import { fuse } from "@plusone/logic";

import { getServerSupabase } from "@/lib/supabase";
import { CloseChat, Composer, ConfirmPlan, ProposePlan } from "./chat-forms";

export const metadata: Metadata = { title: DRAFT_COPY.app.navChats };

const C = DRAFT_COPY.app;

interface Plan {
  date?: string;
  time?: string;
  place?: string;
  proposedBy?: string;
  confirmedBy?: string | null;
}

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user!.id;

  // RLS decides whether this chat is the member's to read. A row coming back
  // empty here is the wall working, not a missing record.
  const { data: chat } = await supabase
    .from("chats")
    .select("id, status, fuse_expires_at, date_plan, closure_template, closure_personal_line, closed_by")
    .eq("id", id)
    .maybeSingle();

  if (!chat) notFound();

  const { data: messages } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("chat_id", id)
    .order("created_at", { ascending: true });

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", me)
    .maybeSingle();

  const plan = (chat.date_plan ?? null) as Plan | null;
  const countdown = fuse.countdown(
    {
      status: chat.status as never,
      fuseExpiresAt: chat.fuse_expires_at ? Date.parse(chat.fuse_expires_at) : null,
      plan: null,
      closure: null,
    },
    Date.now(),
  );

  const isTerminal = ["closed_fuse", "closed_by_member", "graduated"].includes(chat.status);

  return (
    <main id="main">
      {/* The fuse, visible (§7.2). A timer you have to go looking for is a
          deadline that surprises people. */}
      {countdown.isRunning ? (
        <p className={`text-[14px] ${countdown.isExpiringSoon ? "text-caution" : "text-ink-3"}`}>
          {countdown.isExpiringSoon ? C.fuseExpiringSoon : C.fuseDaysLeft(countdown.remainingDays)}
        </p>
      ) : chat.status === "date_planned" ? (
        <p className="text-[14px] text-positive">{C.datePlannedLabel}</p>
      ) : null}

      <ul className="mt-6 flex flex-col gap-3">
        {(messages ?? []).map((message) => (
          <li
            key={message.id as string}
            className={`max-w-[85%] rounded-xl px-4 py-3 text-[15.5px] leading-[1.6] ${
              message.sender_id === me
                ? "self-end bg-accent text-accent-ink"
                : "bg-surface text-ink"
            }`}
          >
            {message.body as string}
          </li>
        ))}
      </ul>

      {isTerminal ? (
        // Every terminal state carries a note. Silence is impossible by
        // construction (§6.2) — so this branch always has something to show.
        <section className="mt-8 rounded-xl border border-line-2 bg-surface p-6">
          <h2 className="text-[1.15rem]">{C.closedNoteHeading}</h2>
          <p className="mt-4 text-[15.5px] leading-[1.7] text-ink-2">
            {renderClosureTemplate((chat.closure_template as number | null) ?? 0)}
            {chat.closure_personal_line ? ` ${chat.closure_personal_line as string}` : ""}
          </p>
        </section>
      ) : (
        <>
          <Composer chatId={id} />

          {chat.status === "open" && !plan ? <ProposePlan chatId={id} /> : null}

          {plan && chat.status !== "date_planned" ? (
            <ConfirmPlan chatId={id} canConfirm={plan.proposedBy !== me} />
          ) : null}

          <CloseChat chatId={id} senderName={(profile?.display_name as string) ?? ""} />
        </>
      )}
    </main>
  );
}
