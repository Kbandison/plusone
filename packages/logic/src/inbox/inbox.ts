import type { Thread, ThreadInput, ThreadState } from "./types";

/**
 * What a thread is waiting on.
 *
 * One function for both stages, because the member is asking one question of
 * every row — "is this mine to do?" — and answering it differently for connects
 * and chats is how the two ended up as separate screens.
 */
export function stateOf(input: ThreadInput): ThreadState {
  if (input.kind === "connect") {
    return input.startedByMe ? "awaiting_their_decision" : "awaiting_your_decision";
  }

  // A closed chat, or one with a plan in it, is owed nothing. The fuse has
  // stopped and there is no reply anybody is waiting for.
  if (input.chatStatus && input.chatStatus !== "open") return "settled";

  if (input.lastMessageAt == null) return "no_messages";
  return input.lastMessageFromMe ? "awaiting_their_reply" : "awaiting_your_reply";
}

/**
 * Whether anything arrived after the member last looked.
 *
 * Their message only. A member's own message is never unread to them, and
 * counting it would light up every thread the moment they sent something.
 *
 * Never looked at is unread when there IS something to see — which is exactly
 * how a chat that opened while you were away should read.
 */
export function isUnread(input: ThreadInput): boolean {
  if (input.lastMessageAt == null) return false;
  if (input.lastMessageFromMe) return false;
  if (input.lastReadAt == null) return true;
  return input.lastMessageAt > input.lastReadAt;
}

/**
 * Newest first, but anything owed by the member comes first regardless.
 *
 * The inbox answers "what needs me" before it answers "what happened lately".
 * A decision somebody is waiting on outranks a chat that is simply recent, and
 * a settled thread never outranks either — it is history, and history sorts by
 * date alone.
 */
const URGENCY: Record<ThreadState, number> = {
  awaiting_your_decision: 0,
  awaiting_your_reply: 1,
  no_messages: 2,
  awaiting_their_decision: 3,
  awaiting_their_reply: 3,
  settled: 4,
};

export function toThread(input: ThreadInput): Thread {
  const state = stateOf(input);
  return {
    id: input.id,
    kind: input.kind,
    state,
    unread: isUnread(input),
    deadlineAt: input.deadlineAt ?? null,
    sortAt: input.lastMessageAt ?? input.updatedAt,
  };
}

export function sortThreads(threads: readonly Thread[]): readonly Thread[] {
  return [...threads].sort((a, b) => {
    const byUrgency = URGENCY[a.state] - URGENCY[b.state];
    if (byUrgency !== 0) return byUrgency;
    // Within a band, an unread thread outranks a read one of the same age.
    if (a.unread !== b.unread) return a.unread ? -1 : 1;
    return b.sortAt - a.sortAt;
  });
}

/** Whether the member owes this thread something. Drives the count on the bar. */
export function needsYou(thread: Thread): boolean {
  return thread.state === "awaiting_your_decision" || thread.state === "awaiting_your_reply";
}

/**
 * The inbox, in the four kinds of thing it actually contains.
 *
 * One flat list was right when the only question was "which of these is mine to
 * do" — but it made a live conversation and an unanswered ask render as the
 * same object, told apart by a three-word label most people never read. They
 * are not the same object. A chat is somewhere you go; a sent connect is
 * something you are waiting on and cannot act on at all.
 *
 * Endings come out too. A closed chat is not a task, and a column of them above
 * the fold pushes the two live threads off it.
 *
 * The states stay a single union — this groups them, it does not re-derive
 * them, so there is still one definition of what a thread is doing.
 */
export function groupThreads<T extends { readonly state: ThreadState }>(
  threads: readonly T[],
): { decisions: T[]; chats: T[]; sent: T[]; settled: T[] } {
  return {
    decisions: threads.filter((t) => t.state === "awaiting_your_decision"),
    chats: threads.filter(
      (t) =>
        t.state === "awaiting_your_reply" ||
        t.state === "awaiting_their_reply" ||
        t.state === "no_messages",
    ),
    sent: threads.filter((t) => t.state === "awaiting_their_decision"),
    settled: threads.filter((t) => t.state === "settled"),
  };
}
