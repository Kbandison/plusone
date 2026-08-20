"use client";

import { useActionState, useEffect, useState } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { OverflowMenu } from "../../overflow-menu";
import { shareToRoom } from "./actions";
import { ROOM_INITIAL } from "./state";

const C = DRAFT_COPY.app;

export interface ShareRoom {
  readonly id: string;
  readonly title: string;
}

/**
 * Out of the app, or into another room.
 *
 * The external half prefers the platform's own share sheet and falls back to
 * the clipboard — navigator.share exists on the phones this is mostly used on
 * and nowhere else, and a Share button that silently does nothing on a laptop
 * is worse than a Copy link that always works.
 *
 * What gets shared is the URL of the POST, not of the article. A member sharing
 * a headline out of a room is sharing the conversation about it as much as the
 * headline, and somebody who follows the link can still reach the original from
 * there. It also means a link out of this app arrives somewhere that knows what
 * a member may see.
 */
export function ShareMenu({
  url,
  title,
  messageId,
  rooms,
}: {
  url: string;
  title: string;
  messageId: string;
  rooms: readonly ShareRoom[];
}) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [state, share, sharing] = useActionState(shareToRoom, ROOM_INITIAL);

  // Read after mount, not during render: navigator does not exist on the
  // server, and branching on it while rendering makes the markup React sends
  // disagree with the markup it finds.
  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <OverflowMenu label={C.postShareLabel} compact trigger={<ShareIcon />}>
      <div className="flex flex-col gap-1 py-2">
        {canShare ? (
          <button
            type="button"
            onClick={() => {
              void navigator.share({ title, url }).catch(() => {
                // Dismissing the sheet rejects. That is not a failure and has
                // nothing to say to anybody.
              });
            }}
            className="ease-brand min-h-tap text-left text-[12.2px] text-ink-2 transition-colors duration-200 hover:text-ink"
          >
            {C.postShareExternal}
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(url).then(() => setCopied(true));
          }}
          className="ease-brand min-h-tap text-left text-[12.2px] text-ink-2 transition-colors duration-200 hover:text-ink"
        >
          {copied ? C.postShareCopied : C.postShareCopy}
        </button>
      </div>

      {rooms.length > 0 ? (
        <div className="py-3">
          <p className="text-[11px] text-ink-3">{C.postShareToRoom}</p>
          <ul className="mt-1 flex flex-col">
            {rooms.map((room) => (
              <li key={room.id}>
                <form action={share}>
                  <input type="hidden" name="message_id" value={messageId} />
                  <input type="hidden" name="target_room_id" value={room.id} />
                  <button
                    type="submit"
                    disabled={sharing}
                    className="ease-brand min-h-tap w-full text-left text-[12.2px] transition-colors duration-200 hover:text-accent disabled:opacity-55"
                  >
                    {room.title}
                  </button>
                </form>
              </li>
            ))}
          </ul>

          {state.error ? (
            <p role="alert" className="mt-1 text-[11px] text-critical">
              {state.error}
            </p>
          ) : null}
          {state.posted ? (
            <p role="status" className="mt-1 text-[11px] text-positive">
              {C.postShareCopied}
            </p>
          ) : null}
        </div>
      ) : null}
    </OverflowMenu>
  );
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
      className="size-[16px] shrink-0"
    >
      <path
        d="M12 3v12M12 3 8 7M12 3l4 4M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
