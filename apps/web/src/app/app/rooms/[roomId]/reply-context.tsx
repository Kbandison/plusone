"use client";

import { createContext, useCallback, useContext, useState } from "react";

/**
 * Who the composer is currently answering.
 *
 * A comment cannot have a comment — the database refuses one, and one level is
 * the whole shape of this. So "reply to a commenter" is not a deeper row; it is
 * the same comment box, addressed to somebody. That is what Facebook does two
 * levels down and it is the honest version of it here: the reply sits beside
 * the others and says who it is for.
 *
 * A context rather than props, because the Reply button lives inside a
 * server-rendered row and the box it fills lives somewhere else on the page.
 */
interface ReplyState {
  readonly replyTo: string | null;
  /**
   * Which comment the reply nests under, or null for a comment on the post.
   *
   * Not the row that was pressed. Answering a REPLY nests under that reply's
   * parent, because the database allows two levels and a third would be
   * refused — so the press carries the comment it belongs to rather than the
   * row it came from.
   */
  readonly replyParentId: string | null;
  /** Whether the box is showing at all. Closed until somebody asks for it. */
  readonly open: boolean;
  /**
   * Bumped every time focus should move to the box.
   *
   * The first version kept a ref to the input here and focused it in a
   * queueMicrotask — which ran BEFORE React had rendered the field, so the ref
   * was still null and the focus went nowhere. Focusing is the composer's job,
   * because the composer is the thing that mounts; this only says when.
   */
  readonly focusRequest: number;
  readonly setReplyTo: (name: string | null, parentId?: string | null) => void;
  readonly openComposer: () => void;
  readonly closeComposer: () => void;
}

const Ctx = createContext<ReplyState>({
  replyTo: null,
  replyParentId: null,
  open: false,
  focusRequest: 0,
  setReplyTo: () => {},
  openComposer: () => {},
  closeComposer: () => {},
});

export function ReplyProvider({ children }: { children: React.ReactNode }) {
  const [replyTo, setReplyToState] = useState<string | null>(null);
  const [replyParentId, setReplyParentId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // A counter, not a boolean.
  //
  // Focus has to move again when Reply is pressed on a second comment while
  // the box is already open — and nothing else about the state has changed at
  // that point, so there is nothing for an effect to depend on. This is the
  // thing that changed.
  const [focusRequest, setFocusRequest] = useState(0);

  const openComposer = useCallback(() => {
    setOpen(true);
    setFocusRequest((n) => n + 1);
  }, []);

  const closeComposer = useCallback(() => {
    setOpen(false);
    setReplyToState(null);
    setReplyParentId(null);
  }, []);

  const setReplyTo = useCallback((name: string | null, parentId: string | null = null) => {
    setReplyToState(name);
    setReplyParentId(parentId);
    if (name) {
      setOpen(true);
      setFocusRequest((n) => n + 1);
    }
  }, []);

  return (
    <Ctx.Provider
      value={{
        replyTo,
        replyParentId,
        open,
        focusRequest,
        setReplyTo,
        openComposer,
        closeComposer,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useReply(): ReplyState {
  return useContext(Ctx);
}
