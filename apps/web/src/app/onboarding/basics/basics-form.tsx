"use client";

import { useActionState, useId } from "react";

import { COPY, DRAFT_COPY } from "@plusone/config";

import { saveBasics } from "./actions";
import { type BasicsState } from "./state";

const C = DRAFT_COPY.basics;
const INITIAL: BasicsState = { error: null };

export function BasicsForm() {
  const [state, action, pending] = useActionState(saveBasics, INITIAL);
  const nameId = useId();
  const nameHintId = useId();
  const dobId = useId();
  const dobHintId = useId();
  const errorId = useId();

  return (
    <form action={action} className="mt-10 flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <label htmlFor={nameId} className="text-[15px]">
          {C.displayNameLabel}
        </label>
        <input
          id={nameId}
          name="display_name"
          type="text"
          required
          maxLength={40}
          autoComplete="nickname"
          // The error too, when there is one. It was given an id and then
          // referenced by nothing, so a member who tabbed back to the field
          // that failed was told only the hint.
          //
          // No aria-invalid: the error is form-level and does not say which
          // field it is about, and marking a field invalid when we cannot tell
          // is a claim rather than a fix.
          aria-describedby={state.error ? `${nameHintId} ${errorId}` : nameHintId}
          className="ease-brand rounded-lg border border-line-2 bg-surface px-4 py-3 text-[16px] transition-colors duration-200 focus:border-accent focus:outline-none"
        />
        <p id={nameHintId} className="text-[13.5px] text-ink-3">
          {C.displayNameHint}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={dobId} className="text-[15px]">
          {C.birthdateLabel}
        </label>
        <input
          id={dobId}
          name="birthdate"
          type="date"
          required
          aria-describedby={state.error ? `${dobHintId} ${errorId}` : dobHintId}
          className="ease-brand w-full rounded-lg border border-line-2 bg-surface px-4 py-3 text-[16px] transition-colors duration-200 focus:border-accent focus:outline-none sm:w-[260px]"
        />
        <p id={dobHintId} className="text-[13.5px] text-ink-3">
          {C.birthdateHint}
        </p>
      </div>

      {state.error ? (
        <p id={errorId} role="alert" className="text-[14.5px] text-critical">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="ease-brand w-full rounded-lg bg-accent px-6 py-3.5 text-[16px] text-accent-ink transition-[opacity,transform] duration-200 hover:opacity-90 active:scale-[0.995] disabled:opacity-55 sm:w-auto sm:min-w-[190px] sm:self-start"
      >
        {COPY.actions.continueLabel}
      </button>
    </form>
  );
}
