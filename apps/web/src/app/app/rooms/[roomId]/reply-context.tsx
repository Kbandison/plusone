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
  /** Whether the box is showing at all. Closed until somebody asks for it. */
  readonly open: boolean;
  readonly setReplyTo: (name: string | null) => void;
  readonly openComposer: () => void;
  readonly closeComposer: () => void;
  readonly register: (input: HTMLInputElement | null) => void;
}

const Ctx = createContext<ReplyState>({
  replyTo: null,
  open: false,
  setReplyTo: () => {},
  openComposer: () => {},
  closeComposer: () => {},
  register: () => {},
});

export function ReplyProvider({ children }: { children: React.ReactNode }) {
  const [replyTo, setReplyToState] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);

  const focusInput = useCallback(() => {
    const field = input.current;
    if (!field) return;
    // A microtask, so the field exists: pressing Reply is what renders it, and
    // focusing before that paint focuses nothing.
    queueMicrotask(() => {
      field.focus();
      const end = field.value.length;
      field.setSelectionRange(end, end);
    });
  }, []);

  const openComposer = useCallback(() => {
    setOpen(true);
    focusInput();
  }, [focusInput]);

  const closeComposer = useCallback(() => {
    setOpen(false);
    setReplyToState(null);
  }, []);

  const setReplyTo = useCallback(
    (name: string | null) => {
      setReplyToState(name);
      if (name) setOpen(true);
      // Focused, and the caret after the name rather than before it. Without the
      // move a member types in front of the person they are answering.
      focusInput();
    },
    [focusInput],
  );

  const register = useCallback((field: HTMLInputElement | null) => {
    input.current = field;
  }, []);

  return (
    <Ctx.Provider value={{ replyTo, open, setReplyTo, openComposer, closeComposer, register }}>
      {children}
    </Ctx.Provider>
  );
}

export function useReply(): ReplyState {
  return useContext(Ctx);
}
