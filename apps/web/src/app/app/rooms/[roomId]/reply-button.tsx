"use client";

import { DRAFT_COPY } from "@plusone/config";

import { useReply } from "./reply-context";

const C = DRAFT_COPY.app;

/**
 * Answering somebody, or just the post.
 *
 * With a name, the box opens addressed to that person. Without one — on the
 * post at the top of a thread — it simply opens: a comment on a post is already
 * addressed to whoever wrote it, and prefilling their name would put it at the
 * front of every top-level answer for nothing.
 *
 * The name it carries is whatever the projection gave the row: a display name,
 * or the alias of somebody posting anonymously. Neither is an id, so addressing
 * a reply to an anonymous member does not tell anybody who they are.
 */
export function ReplyButton({ name, parentId }: { name?: string; parentId?: string }) {
  const { setReplyTo, openComposer } = useReply();

  return (
    <button
      type="button"
      onClick={() => (name ? setReplyTo(name, parentId ?? null) : openComposer())}
      className="ease-brand flex min-h-tap items-center text-[11.5px] text-ink-3 transition-colors duration-200 hover:text-ink"
    >
      {C.postReplyToLabel}
    </button>
  );
}
