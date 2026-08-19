import Link from "next/link";

import { DRAFT_COPY } from "@plusone/config";
import type { inbox } from "@plusone/logic";

import type { MemberPhoto } from "@/lib/photo-urls";
import { MemberPhotoFrame } from "../member-photo";

const C = DRAFT_COPY.app;

const STATE_LABEL: Record<inbox.ThreadState, string> = {
  awaiting_your_decision: C.threadNeedsDecision,
  awaiting_their_decision: C.threadSentWaiting,
  awaiting_your_reply: C.threadNeedsReply,
  awaiting_their_reply: C.threadTheirTurn,
  no_messages: C.threadNoMessages,
  settled: C.threadSettled,
};

export interface ThreadView {
  readonly id: string;
  readonly state: inbox.ThreadState;
  readonly unread: boolean;
  readonly name: string;
  readonly preview: string;
  readonly at: string;
  readonly daysLeft: number | null;
  readonly href: string | null;
  readonly photo: MemberPhoto | undefined;
}

/**
 * One thread, at whatever stage it is at.
 *
 * Everything is on one line each because the question a member is answering is
 * "which of these is mine to do", and that is answered by scanning rather than
 * by reading. The preview is clamped to a single line for the same reason: a
 * full message per row fits three threads on a phone, and three is not a list.
 */
export function ThreadRow({ thread }: { thread: ThreadView }) {
  const owed = thread.state === "awaiting_your_decision" || thread.state === "awaiting_your_reply";

  const body = (
    <>
      <div className="relative shrink-0">
        <MemberPhotoFrame photo={thread.photo} size={40} />
        {/* A dot, not a count. What matters is that something arrived, and a
            number invites a member to feel behind. */}
        {thread.unread ? (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 size-3 rounded-full border-2 border-surface bg-accent"
          />
        ) : null}
      </div>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline justify-between gap-3">
          <span className={`truncate text-[13px] ${thread.unread ? "text-ink" : "text-ink"}`}>
            {thread.name}
            {thread.unread ? <span className="sr-only"> · {C.threadUnread}</span> : null}
          </span>
          <span className="shrink-0 text-[11px] text-ink-3 tabular-nums">{thread.at}</span>
        </span>

        {/* One line. `truncate` rather than a clamp: two lines of preview is
            most of a row, and the preview is a reminder of which thread this is
            rather than the message itself. */}
        <span className="truncate text-[11.7px] text-ink-2">{thread.preview}</span>

        <span className="mt-0.5 flex items-center gap-2.5 text-[11px]">
          <span className={owed ? "text-accent" : "text-ink-3"}>{STATE_LABEL[thread.state]}</span>
          {thread.daysLeft != null ? (
            <span className={thread.daysLeft <= 1 ? "text-caution" : "text-ink-3"}>
              {thread.daysLeft <= 0 ? C.threadExpired : C.threadTimeLeft(thread.daysLeft)}
            </span>
          ) : null}
        </span>
      </span>
    </>
  );

  return (
    <li>
      {thread.href ? (
        <Link
          href={thread.href}
          className="ease-brand flex items-start gap-3.5 rounded-xl border border-line-2 bg-surface p-4 transition-colors duration-200 hover:border-ink-3"
        >
          {body}
        </Link>
      ) : (
        <div className="flex items-start gap-3.5 rounded-xl border border-line-2 bg-surface p-4">
          {body}
        </div>
      )}
    </li>
  );
}
