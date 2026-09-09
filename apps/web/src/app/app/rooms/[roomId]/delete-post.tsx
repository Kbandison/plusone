"use client";

import { useActionState, useState } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { deleteOwnPost, type DeletePostState } from "./actions";

const C = DRAFT_COPY.app;

/**
 * Delete, behind a second press and a sentence.
 *
 * Same two-step as unsend, for the same reason: irreversible and one tap from
 * the thing it destroys. The difference is the warning. `room_feed` nests
 * replies under their parent, so withdrawing a post takes other people's
 * answers out of view with it — allowed, because this app exists so a member
 * can control their own disclosure and a stranger's reply must not put them in
 * charge of it, but not something to discover afterwards.
 */
export function DeletePost({ postId, roomId }: { postId: string; roomId: string }) {
  const [asking, setAsking] = useState(false);
  const [state, action, pending] = useActionState<DeletePostState, FormData>(deleteOwnPost, {
    error: null,
  });

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="ease-brand flex min-h-tap w-full items-center text-left text-[12.6px] text-ink-2 transition-colors duration-300 hover:text-ink"
      >
        {C.postDeleteLabel}
      </button>
    );
  }

  return (
    <form action={action} className="py-2">
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="roomId" value={roomId} />
      <p className="text-[11.7px] leading-[1.5] text-ink-3">{C.postDeleteWarning}</p>
      <div className="mt-2 flex items-center gap-4">
        <button type="submit" disabled={pending} className="text-[12.6px] text-danger">
          {C.postDeleteConfirm}
        </button>
        <button type="button" onClick={() => setAsking(false)} className="text-[12.6px] text-ink-3">
          {C.postDeleteCancel}
        </button>
      </div>
      {state.error ? <p className="mt-2 text-[11.7px] text-danger">{state.error}</p> : null}
    </form>
  );
}
