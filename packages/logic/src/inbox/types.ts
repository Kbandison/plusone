/**
 * One row in the inbox, whatever stage it is at.
 *
 * A pending connect and the chat it becomes are the same thread (Decision #14
 * describes one pipeline), so they are one shape here. The stage is a field
 * rather than a separate list — splitting them is what made accepting a connect
 * look like a row vanishing.
 */
export type ThreadState =
  /** They replied to a prompt and are waiting on you to accept or decline. */
  | "awaiting_your_decision"
  /** You replied to a prompt and nobody has decided yet. */
  | "awaiting_their_decision"
  /** An open chat whose last word was theirs. */
  | "awaiting_your_reply"
  /** An open chat whose last word was yours. */
  | "awaiting_their_reply"
  /** An open chat nobody has said anything in yet. */
  | "no_messages"
  /** Closed, graduated, or a plan made — nothing is owed. */
  | "settled";

export interface ThreadInput {
  readonly id: string;
  readonly kind: "connect" | "chat";
  /** Whether the member is the one who started it. */
  readonly startedByMe: boolean;
  /** Chats only: the current fuse state. */
  readonly chatStatus?: "open" | "date_planned" | "closed_fuse" | "closed_by_member" | "graduated";
  /** Epoch ms of the last message, and who sent it. */
  readonly lastMessageAt?: number | null;
  readonly lastMessageFromMe?: boolean | null;
  /** Epoch ms the member last opened this thread. */
  readonly lastReadAt?: number | null;
  /** When this stops mattering: a connect's expiry or a chat's fuse. */
  readonly deadlineAt?: number | null;
  /** For ordering when nothing else separates two rows. */
  readonly updatedAt: number;
}

export interface Thread {
  readonly id: string;
  readonly kind: "connect" | "chat";
  readonly state: ThreadState;
  /**
   * Something in here arrived after the member last looked.
   *
   * Distinct from `awaiting_your_reply`: a thread can need an answer AND have
   * been read, which is the ordinary state of one you are thinking about.
   */
  readonly unread: boolean;
  readonly deadlineAt: number | null;
  readonly sortAt: number;
}
