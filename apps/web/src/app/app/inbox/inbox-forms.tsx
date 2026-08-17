"use client";

import { useActionState, useState } from "react";

import { CLOSURE_TEMPLATES, CONNECTS, DRAFT_COPY } from "@plusone/config";

import { acceptConnect, declineConnect } from "./actions";
import { INBOX_INITIAL } from "./state";
import { buttonClass } from "@/app/ui";

const C = DRAFT_COPY.app;

export function AcceptForm({
  connectId,
  describedBy,
}: {
  connectId: string;
  /** Id of the reply this decision is about — see the note in page.tsx. */
  describedBy?: string;
}) {
  const [state, act, pending] = useActionState(acceptConnect, INBOX_INITIAL);
  return (
    <form action={act} className="inline">
      <input type="hidden" name="connect_id" value={connectId} />
      <button
        type="submit"
        disabled={pending}
        aria-describedby={describedBy}
        className={buttonClass("primary")}
      >
        {C.acceptLabel}
      </button>
      {state.error ? (
        <span role="alert" className="ml-3 text-[14px] text-critical">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

/**
 * Declining (Decision #14, §3.5).
 *
 * A template is required — there is no "just decline" button, because a decline
 * with no note is the ghosting this product exists to prevent. The optional
 * personal line is tone-checked on the server before it is sent.
 */
export function DeclineForm({
  connectId,
  describedBy,
}: {
  connectId: string;
  /** Id of the reply this decision is about — see the note in page.tsx. */
  describedBy?: string;
}) {
  const [state, act, pending] = useActionState(declineConnect, INBOX_INITIAL);
  const [open, setOpen] = useState(false);

  // The trigger stays mounted. It used to be REPLACED by this form, which
  // unmounted the element holding focus — the member's next Tab started from
  // the top of the page, and nothing announced that a form had appeared.
  // aria-expanded is what says it did, and pressing again is the way back out.
  const trigger = (
    <button
      type="button"
      onClick={() => setOpen((current) => !current)}
      aria-expanded={open}
      aria-describedby={describedBy}
      className={buttonClass("secondary", "hover:border-ink-3")}
    >
      {C.declineLabel}
    </button>
  );

  if (!open) return trigger;

  return (
    <>
      {trigger}
      <form action={act} className="mt-4 flex w-full flex-col gap-4">
        <input type="hidden" name="connect_id" value={connectId} />

        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2 text-[14px] text-ink-2">{C.closeTemplateLabel}</legend>
          {CLOSURE_TEMPLATES.map((template, index) => (
            <label
              key={template}
              className="ease-brand flex cursor-pointer items-start gap-3 rounded-lg border border-line-2 bg-ground px-3.5 py-3 text-[14.5px] transition-colors duration-200 has-checked:border-accent"
            >
              <input
                type="radio"
                name="template"
                value={index}
                defaultChecked={index === 0}
                className="mt-1 size-[16px] shrink-0 accent-accent"
              />
              {template}
            </label>
          ))}
        </fieldset>

        <label className="flex flex-col gap-2 text-[14px] text-ink-2">
          {C.closePersonalLineLabel}
          <input
            name="personal_line"
            type="text"
            maxLength={CONNECTS.personalLineMaxChars}
            className="rounded-lg border border-line-2 bg-ground px-3.5 py-2.5 text-[16px] focus:border-accent"
          />
        </label>

        {state.error ? (
          <p role="alert" className="text-[14px] text-critical">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className={buttonClass("secondary", "self-start hover:border-ink-3")}
        >
          {C.declineLabel}
        </button>
      </form>
    </>
  );
}
