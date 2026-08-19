"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

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
  readonly setReplyTo: (name: string | null) => void;
  readonly register: (input: HTMLInputElement | null) => void;
}

const Ctx = createContext<ReplyState>({
  replyTo: null,
  setReplyTo: () => {},
  register: () => {},
});

export function ReplyProvider({ children }: { children: React.ReactNode }) {
  const [replyTo, setReplyToState] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  const setReplyTo = useCallback((name: string | null) => {
    setReplyToState(name);
    // Focused, and the caret after the name rather than before it. Without the
    // move a member types in front of the person they are answering.
    const field = input.current;
    if (!field) return;
    queueMicrotask(() => {
      field.focus();
      const end = field.value.length;
      field.setSelectionRange(end, end);
    });
  }, []);

  const register = useCallback((field: HTMLInputElement | null) => {
    input.current = field;
  }, []);

  return <Ctx.Provider value={{ replyTo, setReplyTo, register }}>{children}</Ctx.Provider>;
}

export function useReply(): ReplyState {
  return useContext(Ctx);
}
