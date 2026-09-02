"use client";

import { useActionState, useLayoutEffect, useRef, useState } from "react";

import { DRAFT_COPY, MAX_DISPLAY_NAME } from "@plusone/config";

import { saveDisplayName } from "./name-actions";
import { NAME_INITIAL } from "./name-state";

const C = DRAFT_COPY.app;

/**
 * The name, edited where it is shown.
 *
 * It was set once in onboarding and never again — and it is the word every
 * other member sees on every connect, every chat and every room post they did
 * not choose to write anonymously. A typo in it was permanent.
 *
 * The heading IS the field. A labelled text box and a Save button underneath a
 * heading showing the same name is two names on one screen, and a member has to
 * work out which one is real. Here there is one, you click it, and leaving it
 * is what saves it — the same gesture as closing a document.
 *
 * The input carries the 40-character ceiling the column has. Not because the
 * client is trusted with it — the action and the constraint both check — but
 * because being stopped while typing is kinder than being told afterwards.
 */
export function NameEditor({ name }: { name: string }) {
  const [state, act, pending] = useActionState(saveDisplayName, NAME_INITIAL);
  const [value, setValue] = useState(name);
  const [editing, setEditing] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const field = useRef<HTMLInputElement>(null);
  /**
   * What the server last accepted.
   *
   * Blur fires on every exit, including the ones where nothing was typed. Without
   * this, tabbing through the page would POST the same name on every pass.
   */
  const committed = useRef(name);

  /**
   * The field is sized to its own text.
   *
   * Otherwise an editable heading is a full-width box with an inch of dead
   * space after the name, which is the thing that stops it looking like a
   * heading at all.
   *
   * Measured from an off-screen twin rather than counted in characters,
   * because the display face is proportional and "Will" and "MMMM" are not the
   * same width. The character count is still the first guess: it is what the
   * server renders, and it is close enough that nothing jumps when the real
   * measurement lands before the first paint after hydration.
   */
  const [width, setWidth] = useState<number | null>(null);
  const mirror = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (mirror.current) setWidth(mirror.current.offsetWidth);
  }, [value]);

  const commit = () => {
    setEditing(false);
    const next = value.trim();
    if (next === committed.current) {
      // Also repairs whitespace-only edits, which trim away to the same name.
      setValue(committed.current);
      return;
    }
    if (!next) {
      // An empty heading is not a change anybody meant to make.
      setValue(committed.current);
      return;
    }
    committed.current = next;
    setValue(next);
    form.current?.requestSubmit();
  };

  return (
    <form ref={form} action={act} className="relative min-w-0 flex-1">
      {/* Off-screen twin of the field, in the field's own font, whose width the
          field is then given. */}
      <span
        ref={mirror}
        aria-hidden
        className="pointer-events-none invisible absolute top-0 left-0 text-h2 whitespace-pre"
      >
        {value || " "}
      </span>

      <h1 className="min-w-0">
        <input
          ref={field}
          name="display_name"
          value={value}
          maxLength={MAX_DISPLAY_NAME}
          aria-label={C.profileNameLabel}
          /* Not disabled while it saves: commit() has already handed the value
             over by then, and a greyed-out heading mid-save reads as a failure.
             Typing again during the flight and leaving again simply saves the
             newer name, which is what the member asked for both times. */
          aria-busy={pending}
          size={1}
          style={{ width: width ? `min(100%, ${width + 2}px)` : `${Math.max(value.length, 1)}ch` }}
          onChange={(event) => setValue(event.target.value)}
          onFocus={() => setEditing(true)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              field.current?.blur();
            }
            if (event.key === "Escape") {
              setValue(committed.current);
              // Reverted first, so the blur that follows sees the old name and
              // decides there is nothing to save.
              requestAnimationFrame(() => field.current?.blur());
            }
          }}
          /* No box, no border, no fill, and none of them arrive on focus
             either — it is the heading, and a heading that grows a frame when
             you touch it is a heading that jumps.

             The caret is the focus indicator, which is what a caret is for. It
             is the one control on this page where the browser's own outline
             would be a worse signal than the thing already blinking inside it.
             The underline on hover is all that says it can be typed in. */
          className={`ease-brand max-w-full min-w-0 cursor-text border-b bg-transparent px-0 py-1 text-h2 transition-colors duration-300 outline-none ${
            editing ? "border-line-2" : "border-transparent hover:border-line-2"
          }`}
        />
      </h1>

      {state.error ? (
        <p role="alert" className="mt-1.5 text-[11.3px] text-critical">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="mt-1.5 text-[11.3px] text-positive">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
