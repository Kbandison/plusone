"use client";

import { useActionState, useEffect, useState } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { Modal } from "@/app/modal";
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- navigator is absent on the server, for the reason the comment above gives
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Modal
      heading={C.postShareLabel}
      trigger={<ShareIcon />}
      triggerClassName="ease-brand relative z-20 flex min-h-tap items-center gap-1.5 text-[11.5px] text-ink-3 transition-colors duration-200 hover:text-ink"
      /* A sheet above the nav, not a dropdown.
       *
       * As a dropdown it was wrong three ways at once, and all three were the
       * same fact: it hung from a control near the LEFT edge with the panel
       * anchored right, so 232px of it went off the page; and it lived inside
       * the counts row's z-20 stacking context, so nothing it could set for
       * itself would lift it over a nav at z-40 — a child cannot outrank its
       * parent's layer.
       *
       * A dialog is in the top layer, which is above every z-index there is, so
       * it stops being a stacking argument. It is also what a share control
       * looks like on a phone, which is where this is pressed.
       */
      /* Flush to the bottom on a phone, like every other sheet here. Held off
         the nav it read as a panel floating in the middle of nothing — and
         covering the nav costs nothing, because showModal() has already made
         everything behind it inert. Centred on anything wider, where a sheet is
         not the idiom. */
      panelClassName="pb-10 sm:bottom-auto sm:pb-6"
    >
      {(close) => (
        <div className="mt-4 flex flex-col">
          {canShare ? (
            <button
              type="button"
              onClick={() => {
                void navigator.share({ title, url }).catch(() => {
                  // Dismissing the sheet rejects. That is not a failure and has
                  // nothing to say to anybody.
                });
                close();
              }}
              className="ease-brand min-h-tap border-b border-line text-left text-[13px] transition-colors duration-200 hover:text-accent"
            >
              {C.postShareExternal}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(url).then(() => setCopied(true));
            }}
            className="ease-brand min-h-tap border-b border-line text-left text-[13px] transition-colors duration-200 hover:text-accent"
          >
            {copied ? C.postShareCopied : C.postShareCopy}
          </button>

          {rooms.length > 0 ? (
            <>
              <p className="mt-4 text-[11px] tracking-[0.02em] text-ink-3 uppercase">
                {C.postShareToRoom}
              </p>
              <ul className="mt-1 flex flex-col">
                {rooms.map((room) => (
                  <li key={room.id}>
                    <form action={share}>
                      <input type="hidden" name="message_id" value={messageId} />
                      <input type="hidden" name="target_room_id" value={room.id} />
                      <button
                        type="submit"
                        disabled={sharing}
                        className="ease-brand min-h-tap w-full border-b border-line text-left text-[13px] transition-colors duration-200 hover:text-accent disabled:opacity-55"
                      >
                        {room.title}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {state.error ? (
            <p role="alert" className="mt-3 text-[11.7px] text-critical">
              {state.error}
            </p>
          ) : null}
          {state.posted ? (
            <p role="status" className="mt-3 text-[11.7px] text-positive">
              {C.postShareCopied}
            </p>
          ) : null}
        </div>
      )}
    </Modal>
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
