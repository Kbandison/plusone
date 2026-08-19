import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DRAFT_COPY, promptQuestion } from "@plusone/config";
import { inbox as inboxLogic } from "@plusone/logic";

import { photosFor } from "@/lib/photo-urls";
import { getServerSupabase } from "@/lib/supabase";
import { DecisionBubble, type Decision } from "./decision-dialog";
import { ThreadRow, type ThreadView } from "./thread-row";

const C = DRAFT_COPY.app;
const DAY = 86_400_000;

export const metadata: Metadata = { title: C.navInbox };

interface ConnectRow {
  id: string;
  prompt_id: string;
  prompt_reply: string;
  expires_at: string;
  created_at: string;
  initiator_id: string;
  target_id: string;
}

interface ChatRow {
  id: string;
  status: string;
  fuse_expires_at: string | null;
  updated_at: string;
  connect_id: string;
}

/**
 * Everything that is a person, in one list.
 *
 * Two screens became one because Decision #14 describes one pipeline — a
 * connect and the chat it becomes are the same thread, and splitting them made
 * accepting look like a row vanishing. Then "Sent" was its own section inside
 * it, which made a thread you started look like a different kind of object from
 * one somebody sent you. It is not; it is the same thread at a different stage.
 *
 * So there are no sections. The state is on the row, the order puts what the
 * member owes first, and the preview is one line — a full message per row fits
 * three threads on a phone, and three is not a list.
 */
export default async function InboxPage() {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");
  const me = auth.user.id;
  const now = Date.now();

  const [{ data: connectData }, { data: chatData }] = await Promise.all([
    supabase
      .from("connects")
      .select("id, prompt_id, prompt_reply, expires_at, created_at, initiator_id, target_id")
      .eq("status", "pending"),
    supabase.from("chats").select("id, status, fuse_expires_at, updated_at, connect_id"),
  ]);

  const connects = (connectData ?? []) as ConnectRow[];
  const chats = (chatData ?? []) as ChatRow[];

  // Who each chat is with, and what was last said in it.
  //
  // Three round trips for the whole list rather than three per row. The name
  // comes from visible_profiles, so someone who has since blocked you or left
  // dating has no name here rather than leaking one.
  const chatIds = chats.map((chat) => chat.id);
  const [{ data: chatConnects }, { data: recentMessages }, { data: reads }] = await Promise.all([
    chats.length
      ? supabase
          .from("connects")
          .select("id, initiator_id, target_id")
          .in(
            "id",
            chats.map((chat) => chat.connect_id),
          )
      : Promise.resolve({ data: [] as { id: string; initiator_id: string; target_id: string }[] }),
    chatIds.length
      ? supabase
          .from("messages")
          .select("chat_id, sender_id, body, voice_note_path, created_at")
          .in("chat_id", chatIds)
          .order("created_at", { ascending: false })
          // Bounded. The newest few hundred across every chat is far more than
          // enough to find the last of each, and an unbounded read grows with
          // the whole history of every conversation the member has ever had.
          .limit(300)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    chatIds.length
      ? supabase.from("chat_reads").select("chat_id, last_read_at").in("chat_id", chatIds)
      : Promise.resolve({ data: [] as { chat_id: string; last_read_at: string }[] }),
  ]);

  const otherByConnect = new Map(
    (chatConnects ?? []).map((row) => [
      row.id as string,
      ((row.initiator_id as string) === me ? row.target_id : row.initiator_id) as string,
    ]),
  );

  // First seen wins: the query came back newest-first.
  const lastMessage = new Map<string, { senderId: string; body: string; at: number }>();
  for (const row of (recentMessages ?? []) as Record<string, unknown>[]) {
    const chatId = row["chat_id"] as string;
    if (lastMessage.has(chatId)) continue;
    lastMessage.set(chatId, {
      senderId: row["sender_id"] as string,
      // A voice note has no body. Saying so beats an empty line that reads as
      // a message that failed to load.
      body: ((row["body"] as string | null) ?? "").trim() || C.threadVoiceNote,
      at: Date.parse(row["created_at"] as string),
    });
  }

  const readAt = new Map(
    (reads ?? []).map((row) => [
      (row as { chat_id: string }).chat_id,
      Date.parse((row as { last_read_at: string }).last_read_at),
    ]),
  );

  const otherIds = [
    ...new Set([
      ...connects.map((c) => (c.initiator_id === me ? c.target_id : c.initiator_id)),
      ...otherByConnect.values(),
    ]),
  ];
  const [{ data: profiles }, photos] = await Promise.all([
    otherIds.length
      ? supabase.from("visible_profiles").select("id, display_name").in("id", otherIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
    otherIds.length ? photosFor(otherIds) : Promise.resolve(new Map()),
  ]);

  const nameById = new Map(
    (profiles ?? []).map((row) => [row.id as string, row.display_name as string]),
  );

  const inputs: inboxLogic.ThreadInput[] = [
    ...connects.map((connect) => ({
      id: connect.id,
      kind: "connect" as const,
      startedByMe: connect.initiator_id === me,
      deadlineAt: Date.parse(connect.expires_at),
      updatedAt: Date.parse(connect.created_at),
    })),
    ...chats.map((chat) => {
      const last = lastMessage.get(chat.id);
      return {
        id: chat.id,
        kind: "chat" as const,
        startedByMe: false,
        chatStatus: chat.status as never,
        lastMessageAt: last?.at ?? null,
        lastMessageFromMe: last ? last.senderId === me : null,
        lastReadAt: readAt.get(chat.id) ?? null,
        // The fuse only counts while the chat is open (#13 clears it on a plan).
        deadlineAt:
          chat.status === "open" && chat.fuse_expires_at ? Date.parse(chat.fuse_expires_at) : null,
        updatedAt: Date.parse(chat.updated_at),
      };
    }),
  ];

  const connectById = new Map(connects.map((c) => [c.id, c]));
  const chatById = new Map(chats.map((c) => [c.id, c]));

  const threads: ThreadView[] = inboxLogic
    .sortThreads(inputs.map(inboxLogic.toThread))
    .map((thread) => {
      const otherId =
        thread.kind === "connect"
          ? (() => {
              const connect = connectById.get(thread.id)!;
              return connect.initiator_id === me ? connect.target_id : connect.initiator_id;
            })()
          : (otherByConnect.get(chatById.get(thread.id)?.connect_id ?? "") ?? "");

      const preview =
        thread.kind === "connect"
          ? (connectById.get(thread.id)?.prompt_reply ?? "")
          : (lastMessage.get(thread.id)?.body ?? C.threadNoMessages);

      return {
        id: thread.id,
        state: thread.state,
        unread: thread.unread,
        name: nameById.get(otherId) ?? C.threadUnknownPerson,
        preview,
        at: new Date(thread.sortAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        daysLeft: thread.deadlineAt == null ? null : Math.ceil((thread.deadlineAt - now) / DAY),
        href: thread.kind === "chat" ? `/app/chats/${thread.id}` : null,
        photo: photos.get(otherId),
      };
    });

  // Decisions come out of the list.
  //
  // They are a different KIND of thing: a connect is somebody asking, and every
  // one of them is the same two irreversible buttons. Left in the list they
  // read as messages that happen to have controls, and the list stops being
  // scannable — which is the whole reason the rows got shorter.
  const conversations = threads.filter((t) => t.state !== "awaiting_your_decision");
  const decisions: Decision[] = threads
    .filter((t) => t.state === "awaiting_your_decision")
    .map((thread) => {
      const connect = connectById.get(thread.id)!;
      return {
        id: thread.id,
        name: thread.name,
        question: promptQuestion(connect.prompt_id),
        reply: connect.prompt_reply,
        photo: thread.photo,
      };
    });

  return (
    <main id="main">
      <h1 className="text-h2">{C.inboxHeading}</h1>

      {decisions.length > 0 ? (
        <section className="mt-7">
          <h2 className="text-[12.2px] tracking-[0.04em] text-ink-3 uppercase">
            {C.decisionsHeading(decisions.length)}
          </h2>

          {/* Horizontal, because this is a queue rather than a list: it grows
              sideways and never pushes the conversations off the screen.
              -mx-6/px-6 lets it bleed to the edges so a half-cut face is what
              tells you there is more, which no scrollbar on a phone will. */}
          <ul className="-mx-6 mt-3 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-1">
            {decisions.map((decision) => (
              <li key={decision.id} className="snap-start">
                {/* The face opens a dialog rather than a page: the queue is for
                    scanning, and leaving the screen to answer one of these lost
                    the others. */}
                <DecisionBubble decision={decision} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {threads.length === 0 ? (
        <p className="mt-8 text-[14.4px] text-ink-2">{C.inboxAllEmpty}</p>
      ) : conversations.length > 0 ? (
        <ul className="mt-8 flex flex-col gap-2.5">
          {conversations.map((thread) => (
            <ThreadRow key={thread.id} thread={thread} />
          ))}
        </ul>
      ) : null}
    </main>
  );
}
