"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { DRAFT_COPY } from "@plusone/config";

const C = DRAFT_COPY.app;

/**
 * The box above a Latest news feed.
 *
 * A member does not post an article, so a composer there is a control that
 * cannot do anything. The space is the same shape and does the thing somebody
 * actually wants in a room of headlines.
 *
 * The term lives in the URL rather than in state: a search is a place, so it
 * survives a refresh, can be sent to somebody, and comes back when the browser
 * goes back. It also means the filtering happens in room_feed rather than here,
 * which is the difference between searching the room and searching the hundred
 * posts that happened to be rendered.
 */
export function RoomSearch({ roomId }: { roomId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [term, setTerm] = useState(params.get("q") ?? "");

  const go = (next: string) => {
    const query = next.trim();
    router.replace(
      query ? `/app/rooms/${roomId}?q=${encodeURIComponent(query)}` : `/app/rooms/${roomId}`,
    );
  };

  return (
    <form role="search" action={() => go(term)} className="mt-4 flex items-center gap-3">
      <input
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={C.roomSearchPlaceholder}
        // A placeholder is not a label: it is gone the moment a character is
        // typed, so a member who tabs back lands on an unnamed field.
        aria-label={C.roomSearchPlaceholder}
        className="min-w-0 flex-1 rounded-xl border border-line-control bg-surface px-4 py-3 text-[16px] focus:border-accent"
      />

      {params.get("q") ? (
        <button
          type="button"
          onClick={() => {
            setTerm("");
            go("");
          }}
          className="ease-brand min-h-tap text-[11.7px] text-ink-3 underline decoration-line-2 underline-offset-4 transition-colors duration-300 hover:text-ink"
        >
          {C.roomSearchClear}
        </button>
      ) : null}
    </form>
  );
}
