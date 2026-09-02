"use client";

import { useActionState, useState } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { unsendMessage, type UnsendState } from "./unsend-actions";

const C = DRAFT_COPY.app;

/**
 * Unsend, behind a second press.
 *
 * Irreversible and one tap from the conversation, which is the combination this
 * product already refuses elsewhere — `draft-copy.ts` carries the note that an
 * action with "no way to undo them in one press is a dead end describing
 * itself". The first press asks, the second does it, and anything else on the
 * screen cancels by leaving it be.
 *
 * A plain button rather than a dialog: a modal over a chat to withdraw one line
 * is heavier than the thing it guards, and the message is still on screen to be
 * read while the question is being asked — which a dialog would cover.
 */
export function UnsendButton({ messageId, chatId }: { messageId: string; chatId: string }) {
  const [asking, setAsking] = useState(false);
  const [state, action, pending] = useActionState<UnsendState, FormData>(unsendMessage, {
    error: null,
  });

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="mt-1.5 px-1 text-[10.5px] text-ink-3 underline decoration-line-2 underline-offset-4 hover:text-ink"
      >
        {C.unsendLabel}
      </button>
    );
  }

  return (
    <form action={action} className="mt-1.5 flex items-center gap-3 px-1">
      <input type="hidden" name="messageId" value={messageId} />
      <input type="hidden" name="chatId" value={chatId} />
      <button
        type="submit"
        disabled={pending}
        className="text-[10.5px] text-danger underline decoration-line-2 underline-offset-4"
      >
        {C.unsendConfirm}
      </button>
      <button
        type="button"
        onClick={() => setAsking(false)}
        className="text-[10.5px] text-ink-3 underline decoration-line-2 underline-offset-4"
      >
        {C.unsendCancel}
      </button>
      {state.error ? <span className="text-[10.5px] text-danger">{state.error}</span> : null}
    </form>
  );
}
