"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { DRAFT_COPY } from "@plusone/config";
import { mentions } from "@plusone/logic";

import { joinRoom, postComment } from "./actions";
import { ROOM_INITIAL } from "./state";
import { buttonClass } from "@/app/ui";
import { useReply } from "./reply-context";
import { CloseIcon } from "@/app/modal";

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

export function CommentComposer({ roomId, parentId }: { roomId: string; parentId: string }) {
  const [state, act, pending] = useActionState(postComment, ROOM_INITIAL);
  const { replyTo, replyParentId, open, focusRequest, closeComposer, setReplyTo } = useReply();
  const field = useRef<HTMLInputElement>(null);

  // After the render that mounted it, which is the whole point: focusing in the
  // handler that opens the box focuses a field that does not exist yet.
  useEffect(() => {
    if (!open || focusRequest === 0) return;
    const input = field.current;
    if (!input) return;
    input.focus();
    // Caret at the end, or a member types in front of the person they are
    // answering.
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }, [open, focusRequest]);
  const [body, setBody] = useState("");

  // The name goes into the box, the way Facebook does it, so what is sent is
  // just a message that says who it is for. Nothing structured, nothing stored
  // — and for somebody posting anonymously it is their alias, which is not an
  // id and gives nothing away.
  //
  // Tagged now, rather than bare. A bare name only reads as a name at the very
  // front of a message, which is the one place a reply can put it and the one
  // place a member typing their own cannot. It also could not be told apart
  // from a sentence that happens to begin with a word, so nobody was ever
  // notified of being addressed — see mentionPrefix and parseMentions, which
  // are the same pair of functions the server reads it back with.
  // useState, not useRef — see the same pattern in photos-form.tsx. The
  // comparison has to be discarded along with a render that is discarded, or a
  // thrown-away render leaves this advanced and the next Reply press does not
  // put the name in the box.
  const [previous, setPrevious] = useState<string | null>(null);
  if (replyTo !== previous) {
    setPrevious(replyTo);
    const tag = replyTo ? mentions.mentionPrefix(replyTo) : "";
    if (replyTo) setBody((current) => (current.startsWith(tag.trim()) ? current : tag));
  }

  // Nothing at all until a Reply is pressed.
  //
  // There was a trigger here — "Add a comment" — and it was one more thing at
  // the bottom of a page that already ends in Reply on the post and Reply on
  // every comment. Three ways into one box is two too many.
  if (!open) return null;

  return (
    <form
      action={(formData) => {
        act(formData);
        setBody("");
        closeComposer();
      }}
      className="mt-6 flex flex-col gap-3"
    >
      <input type="hidden" name="room_id" value={roomId} />
      {/* Under the comment being answered, or under the post. parentId is the
          post; replyParentId is set only when a Reply came from a comment. */}
      <input type="hidden" name="parent_id" value={replyParentId ?? parentId} />

      {/* Said above the box as well as put in it. The name alone in the field
          could be something the member typed; this is the part that says the
          product is in a mode, and the part that offers a way out of it. */}
      {replyTo ? (
        <p className="flex items-center gap-3 text-[11px] text-ink-3">
          {C.postReplyingTo(replyTo)}
          <button
            type="button"
            onClick={() => {
              // The same string the box wrote, taken back out whole. These two
              // drifted the moment the "@" was added in one of them and not the
              // other, leaving a lone "@" at the front of the message.
              setBody((current) => {
                const tag = mentions.mentionPrefix(replyTo).trim();
                return current.startsWith(tag) ? current.slice(tag.length).trimStart() : current;
              });
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
          ref={field}
          name="body"
          /* Escape closes it, which is what a member reaches for and what every
             other dismissable thing in this app already answers to. Sending was
             the only way out before, so changing your mind meant posting
             something or leaving the page. */
          onKeyDown={(event) => {
            if (event.key === "Escape") closeComposer();
          }}
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

        {/* And a control, because Escape is invisible and a touch keyboard has
            no key for it — which is most of the people using this. */}
        <button
          type="button"
          onClick={closeComposer}
          aria-label={C.decisionDismiss}
          className="ease-brand flex size-tap shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors duration-200 hover:text-ink"
        >
          <CloseIcon />
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
