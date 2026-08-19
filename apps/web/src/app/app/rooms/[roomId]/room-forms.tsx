"use client";

import { useActionState, useRef, useState } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { joinRoom, postComment, postToRoom } from "./actions";
import { ROOM_INITIAL } from "./state";
import { buttonClass } from "@/app/ui";
import { useReply } from "./reply-context";

const C = DRAFT_COPY.app;

export function JoinRoom({ roomId }: { roomId: string }) {
  const [state, act, pending] = useActionState(joinRoom, ROOM_INITIAL);
  return (
    <form action={act} className="mt-6">
      <input type="hidden" name="room_id" value={roomId} />
      <button type="submit" disabled={pending} className={buttonClass("primary")}>
        {C.roomJoinLabel}
      </button>
      {state.error ? (
        <p role="alert" className="mt-3 text-[11.3px] text-critical">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function RoomComposer({ roomId }: { roomId: string }) {
  const [state, act, pending] = useActionState(postToRoom, ROOM_INITIAL);
  return (
    <form action={act} className="mt-8 flex flex-col gap-3">
      <input type="hidden" name="room_id" value={roomId} />
      <div className="flex gap-3">
        <input
          name="body"
          type="text"
          maxLength={2000}
          placeholder={C.roomPostPlaceholder}
          // A placeholder is not a label: it is gone the moment a character is
          // typed, so a member who tabs back lands on an unnamed field. This is
          // the primary messaging control of the product.
          aria-label={C.roomPostPlaceholder}
          className="flex-1 rounded-lg border border-line-control bg-surface px-4 py-3 text-[16px] focus:border-accent"
        />
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {C.roomPostLabel}
        </button>
      </div>

      {/* Per post, and off by default.
          A default that hides everyone makes a room of strangers, and somebody
          who has decided to be anonymous will say so. The note is there because
          "anonymous" alone does not answer the two questions a member actually
          has: anonymous to whom, and is it the same me next time. */}
      <label className="flex items-start gap-3 text-[11.7px]">
        <input
          type="checkbox"
          name="anonymous"
          className="mt-0.5 size-[14.6px] shrink-0 accent-accent"
        />
        <span className="flex flex-col gap-1">
          {C.postAnonymousLabel}
          <span className="text-[10.5px] leading-[1.5] text-ink-3">{C.postAnonymousNote}</span>
        </span>
      </label>

      {state.error ? (
        <p role="alert" className="text-[11.3px] text-critical">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

/**
 * A comment, which is the composer again with a parent on it.
 *
 * Deliberately the same controls, including the anonymity checkbox: a member
 * who posted anonymously and then replied under their own name would have
 * undone their own cover in the one place it matters most. The choice is per
 * post, so it has to be offered per post.
 */
export function CommentComposer({ roomId, parentId }: { roomId: string; parentId: string }) {
  const [state, act, pending] = useActionState(postComment, ROOM_INITIAL);
  const { replyTo, setReplyTo, register } = useReply();
  const [body, setBody] = useState("");

  // The name goes into the box, the way Facebook does it, so what is sent is
  // just a message that says who it is for. Nothing structured, nothing stored
  // — and for somebody posting anonymously it is their alias, which is not an
  // id and gives nothing away.
  const previous = useRef<string | null>(null);
  if (replyTo !== previous.current) {
    previous.current = replyTo;
    if (replyTo) setBody((current) => (current.startsWith(replyTo) ? current : `${replyTo} `));
  }

  return (
    <form
      action={(formData) => {
        act(formData);
        setBody("");
        setReplyTo(null);
      }}
      className="mt-6 flex flex-col gap-3"
    >
      <input type="hidden" name="room_id" value={roomId} />
      <input type="hidden" name="parent_id" value={parentId} />

      {/* Said above the box as well as put in it. The name alone in the field
          could be something the member typed; this is the part that says the
          product is in a mode, and the part that offers a way out of it. */}
      {replyTo ? (
        <p className="flex items-center gap-3 text-[11px] text-ink-3">
          {C.postReplyingTo(replyTo)}
          <button
            type="button"
            onClick={() => {
              setBody((current) =>
                current.startsWith(replyTo) ? current.slice(replyTo.length).trimStart() : current,
              );
              setReplyTo(null);
            }}
            className="ease-brand underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
          >
            {C.postReplyCancel}
          </button>
        </p>
      ) : null}

      <div className="flex gap-3">
        <input
          ref={register}
          name="body"
          type="text"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={2000}
          placeholder={C.postReplyPlaceholder}
          aria-label={C.postReplyPlaceholder}
          className="min-w-0 flex-1 rounded-lg border border-line-control bg-surface px-4 py-3 text-[16px] focus:border-accent"
        />
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {C.postReplyLabel}
        </button>
      </div>

      <label className="flex items-start gap-3 text-[11.7px]">
        <input
          type="checkbox"
          name="anonymous"
          className="mt-0.5 size-[14.6px] shrink-0 accent-accent"
        />
        <span className="flex flex-col gap-1">
          {C.postAnonymousLabel}
          <span className="text-[10.5px] leading-[1.5] text-ink-3">{C.postAnonymousNote}</span>
        </span>
      </label>

      {state.error ? (
        <p role="alert" className="text-[11.3px] text-critical">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
