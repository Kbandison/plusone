"use client";

import { DRAFT_COPY } from "@plusone/config";

import { useReply } from "./reply-context";

const C = DRAFT_COPY.app;

/**
 * Answering one comment rather than the post.
 *
 * The name it carries is whatever room_feed gave the row — a display name, or
 * the alias of somebody posting anonymously. Neither is an id, so addressing a
 * reply to an anonymous member does not tell anybody who they are.
 */
export function ReplyButton({ name }: { name: string }) {
  const { setReplyTo } = useReply();

  return (
    <button
      type="button"
      onClick={() => setReplyTo(name)}
      className="ease-brand flex min-h-tap items-center text-[11.5px] text-ink-3 transition-colors duration-200 hover:text-ink"
    >
      {C.postReplyToLabel}
    </button>
  );
}
