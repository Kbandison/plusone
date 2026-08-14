"use client";

import { useActionState, useState } from "react";

import { CLOSURE_TEMPLATES, CONNECTS, DRAFT_COPY } from "@plusone/config";

import { INBOX_INITIAL, acceptConnect, declineConnect } from "./actions";

const C = DRAFT_COPY.app;

export function AcceptForm({ connectId }: { connectId: string }) {
  const [state, act, pending] = useActionState(acceptConnect, INBOX_INITIAL);
  return (
    <form action={act} className="inline">
      <input type="hidden" name="connect_id" value={connectId} />
      <button
        type="submit"
        disabled={pending}
        className="ease-brand rounded-lg bg-accent px-5 py-2.5 text-[15px] text-accent-ink transition-opacity duration-200 hover:opacity-90 disabled:opacity-55"
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
export function DeclineForm({ connectId }: { connectId: string }) {
  const [state, act, pending] = useActionState(declineConnect, INBOX_INITIAL);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ease-brand rounded-lg border border-line-2 px-5 py-2.5 text-[15px] transition-colors duration-200 hover:border-ink-3"
      >
        {C.declineLabel}
      </button>
    );
  }

  return (
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
          className="rounded-lg border border-line-2 bg-ground px-3.5 py-2.5 text-[15px] focus:border-accent focus:outline-none"
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
        className="ease-brand self-start rounded-lg border border-line-2 px-5 py-2.5 text-[15px] transition-colors duration-200 hover:border-ink-3 disabled:opacity-55"
      >
        {C.declineLabel}
      </button>
    </form>
  );
}
