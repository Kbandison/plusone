"use client";

import { useState } from "react";

/**
 * A message, and the time it was sent, one press away.
 *
 * The bubble is the control. That means a tab stop per message, which is the
 * cost of the interaction and is paid honestly: the alternative — a div with an
 * onClick — puts the same behaviour behind something a keyboard cannot reach
 * and a screen reader will not announce.
 *
 * The time is in the markup either way. Nobody has to press this to have it;
 * pressing is how you SEE it. `select-text` because a bubble you cannot copy
 * out of is worse than one with no timestamp.
 *
 * Voice notes do not come through here. An <audio controls> inside a button is
 * invalid, and the browser's own play control stops working — so those bubbles
 * stay plain and wear their time openly.
 */
export function TextBubble({
  mine,
  who,
  body,
  label,
  exact,
  iso,
  action,
}: {
  mine: boolean;
  who: string | null;
  body: string;
  /** "09:41", "Yesterday 22:10" — formatted on the server so both renders agree. */
  label: string;
  exact: string;
  iso: string;
  /**
   * Revealed with the time, on your own messages.
   *
   * A node rather than a boolean, so this component keeps knowing nothing about
   * unsending. It already owns the one press that opens a message up, and a
   * second interaction INSIDE the bubble would be a button within a button —
   * invalid, and it stops working.
   */
  action?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <li className={mine ? "flex flex-col items-end" : "flex flex-col items-start"}>
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        /* Own messages are surface-2 with an accent edge, not an accent FILL.
           The token file's own contract reads "CTAs, links, highlights,
           interactive states — never large fills", restating the design
           system's colour rule; a column of accent-filled bubbles is the
           largest fill in the app and it makes every real control on the screen
           compete with the conversation. Alignment and the edge carry the same
           distinction more quietly. */
        className={`ease-brand max-w-[85%] cursor-default rounded-xl px-4 py-3 text-left text-[12.6px] leading-[1.6] transition-colors duration-200 select-text ${
          mine
            ? "border-r-2 border-accent bg-surface-2 text-ink"
            : "border-l-2 border-line-2 bg-surface text-ink"
        }`}
      >
        {/* Who said it. Colour and alignment were the only signal, so a screen
            reader heard an undifferentiated run of sentences with no way to
            tell your own words from theirs. */}
        {who ? <span className="sr-only">{who}: </span> : null}
        {body}
      </button>

      {/* Outside the button, so pressing the time does not toggle it shut, and
          so it is not read as part of the button's name. sr-only when closed
          rather than absent: hiding the time from the one member who cannot see
          the layout is the wrong half to keep. */}
      <time
        dateTime={iso}
        title={exact}
        className={open ? "mt-1.5 px-1 text-[10.5px] text-ink-3" : "sr-only"}
      >
        {label}
      </time>

      {/* Only once the bubble is open. Visible on every message of yours, it
          would put an irreversible control on every line of the conversation —
          and this is already the gesture that means "tell me more about this
          one". */}
      {open ? action : null}
    </li>
  );
}
