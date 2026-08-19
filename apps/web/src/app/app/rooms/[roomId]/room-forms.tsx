"use client";

import { useActionState } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { joinRoom, postToRoom } from "./actions";
import { ROOM_INITIAL } from "./state";
import { buttonClass } from "@/app/ui";

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
      {state.error ? (
        <p role="alert" className="text-[11.3px] text-critical">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
