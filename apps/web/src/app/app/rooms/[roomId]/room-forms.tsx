"use client";

import { useActionState } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { ROOM_INITIAL, joinRoom, postToRoom } from "./actions";

const C = DRAFT_COPY.app;

export function JoinRoom({ roomId }: { roomId: string }) {
  const [state, act, pending] = useActionState(joinRoom, ROOM_INITIAL);
  return (
    <form action={act} className="mt-6">
      <input type="hidden" name="room_id" value={roomId} />
      <button
        type="submit"
        disabled={pending}
        className="ease-brand rounded-lg bg-accent px-5 py-2.5 text-[15px] text-accent-ink transition-opacity duration-200 hover:opacity-90 disabled:opacity-55"
      >
        {C.roomJoinLabel}
      </button>
      {state.error ? (
        <p role="alert" className="mt-3 text-[14px] text-critical">
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
          className="flex-1 rounded-lg border border-line-2 bg-surface px-4 py-3 text-[16px] focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="ease-brand rounded-lg bg-accent px-5 py-3 text-[15px] text-accent-ink transition-opacity duration-200 hover:opacity-90 disabled:opacity-55"
        >
          {C.roomPostLabel}
        </button>
      </div>
      {state.error ? (
        <p role="alert" className="text-[14px] text-critical">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
