"use client";

import { useRef } from "react";

import Link from "next/link";

import { DRAFT_COPY } from "@plusone/config";
import type { inbox } from "@plusone/logic";

import type { MemberPhoto } from "@/lib/photo-urls";
import { MemberPhotoFrame } from "../member-photo";
import { CloseIcon } from "./decision-dialog";

const C = DRAFT_COPY.app;

const STATE_LABEL: Record<inbox.ThreadState, string> = {
  awaiting_your_decision: C.threadNeedsDecision,
  awaiting_their_decision: C.threadSentWaiting,
  awaiting_your_reply: C.threadNeedsReply,
  awaiting_their_reply: C.threadTheirTurn,
  no_messages: C.threadNoMessages,
  settled: C.threadSettled,
};

/** What a member sent, so a sent thread can be re-read. */
export interface SentDetail {
  readonly question: string | null;
  readonly reply: string;
}

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
  /**
   * Set on a connect the member sent and nobody has answered.
   *
   * These rows had no href — only chats did — so they rendered as a plain div.
   * A thread you cannot open is a thread you cannot re-read, and what you wrote
   * to somebody is the one thing you might want to check while waiting.
   */
  readonly sent?: SentDetail | undefined;
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
  const dialog = useRef<HTMLDialogElement>(null);
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
          <span
            className={`truncate text-[15px] ${thread.unread ? "font-medium text-ink" : "text-ink"}`}
          >
            {thread.name}
            {thread.unread ? <span className="sr-only"> · {C.threadUnread}</span> : null}
          </span>
          <span className="shrink-0 text-[12px] text-ink-3 tabular-nums">{thread.at}</span>
        </span>

        {/* One line. `truncate` rather than a clamp: two lines of preview is
            most of a row, and the preview is a reminder of which thread this is
            rather than the message itself. */}
        <span className="truncate text-[13.5px] text-ink-2">{thread.preview}</span>

        <span className="mt-1 flex items-center gap-2.5 text-[12.5px]">
          <span className={owed ? "text-accent" : "text-ink-2"}>{STATE_LABEL[thread.state]}</span>
          {thread.daysLeft != null ? (
            <span className={thread.daysLeft <= 1 ? "text-caution" : "text-ink-3"}>
              {thread.daysLeft <= 0 ? C.threadExpired : C.threadTimeLeft(thread.daysLeft)}
            </span>
          ) : null}
        </span>
      </span>
    </>
  );

  // Three kinds of row: a chat is a link, a sent connect opens a dialog to be
  // re-read, and anything else is inert.
  if (thread.sent) {
    return (
      <li>
        <button
          type="button"
          onClick={() => dialog.current?.showModal()}
          className="ease-brand flex w-full items-start gap-3.5 rounded-xl border border-line-2 bg-surface p-4 text-left transition-colors duration-200 hover:border-ink-3"
        >
          {body}
        </button>

        <dialog
          ref={dialog}
          aria-label={thread.name}
          onClick={(event) => {
            if (event.target === dialog.current) dialog.current?.close();
          }}
          className="ease-brand m-0 mt-auto w-full max-w-[421.2px] rounded-t-2xl border border-line-2 bg-surface p-5 text-ink sm:m-auto sm:rounded-2xl"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <MemberPhotoFrame photo={thread.photo} size={52} />
              <div>
                <h2 className="text-h3">{thread.name}</h2>
                <p className="mt-0.5 text-[12.5px] text-ink-2">{STATE_LABEL[thread.state]}</p>
              </div>
            </div>

            <form method="dialog" className="-mt-1 -mr-1">
              <button
                type="submit"
                aria-label={C.decisionDismiss}
                className="ease-brand flex size-tap items-center justify-center rounded-lg text-ink-3 transition-colors duration-200 hover:text-ink"
              >
                <CloseIcon />
              </button>
            </form>
          </div>

          {/* What you wrote, under the question you answered. Without the
              question a reply is half a sentence, which is as true of your own
              words as of theirs. */}
          <figure className="mt-5 rounded-xl border border-line-2 bg-ground p-4">
            {thread.sent.question ? (
              <figcaption className="text-[11.5px] tracking-[0.02em] text-ink-3 uppercase">
                {thread.sent.question}
              </figcaption>
            ) : null}
            <blockquote className="mt-1.5 text-[14.5px] leading-[1.6]">
              {thread.sent.reply}
            </blockquote>
          </figure>

          {thread.daysLeft != null ? (
            <p className="mt-4 text-[12.5px] text-ink-3">
              {thread.daysLeft <= 0 ? C.threadExpired : C.threadTimeLeft(thread.daysLeft)}
            </p>
          ) : null}
        </dialog>
      </li>
    );
  }

  // Everything else is a chat, and a chat always has somewhere to go. The
  // inert <div> that used to stand here was unreachable once sent connects got
  // their dialog — and while it WAS reachable it was the bug: a row that looked
  // exactly like the others and did nothing when pressed.
  return (
    <li>
      <Link
        href={thread.href ?? "/app/inbox"}
        className="ease-brand flex items-start gap-3.5 rounded-xl border border-line-2 bg-surface p-4 transition-colors duration-200 hover:border-ink-3"
      >
        {body}
      </Link>
    </li>
  );
}
