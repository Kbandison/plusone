"use client";

import { useActionState, useId } from "react";

import { COPY, DRAFT_COPY } from "@plusone/config";

import { saveBasics } from "./actions";
import { type BasicsState } from "./state";
import { buttonClass } from "@/app/ui";
import { StepActions } from "@/app/onboarding/step-actions";

const C = DRAFT_COPY.basics;
const INITIAL: BasicsState = { error: null };

export function BasicsForm({
  displayName = "",
  birthdate = "",
}: {
  displayName?: string;
  birthdate?: string;
}) {
  const [state, action, pending] = useActionState(saveBasics, INITIAL);
  const nameId = useId();
  const nameHintId = useId();
  const dobId = useId();
  const dobHintId = useId();
  const errorId = useId();

  return (
    <form action={action} className="mt-10 flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <label htmlFor={nameId} className="text-[14.5px]">
          {C.displayNameLabel}
        </label>
        <input
          id={nameId}
          name="display_name"
          type="text"
          // Filled from the row, so walking back to fix one field does not mean
          // retyping the other — and so a member who only looked does not
          // submit an empty form over a real answer.
          defaultValue={displayName}
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
          className="ease-brand rounded-lg border border-line-control bg-surface px-4 py-3 text-[16px] transition-colors duration-200 focus:border-accent"
        />
        <p id={nameHintId} className="text-[13px] text-ink-3">
          {C.displayNameHint}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={dobId} className="text-[14.5px]">
          {C.birthdateLabel}
        </label>
        <input
          id={dobId}
          name="birthdate"
          type="date"
          defaultValue={birthdate}
          required
          aria-describedby={state.error ? `${dobHintId} ${errorId}` : dobHintId}
          className="ease-brand w-full rounded-lg border border-line-control bg-surface px-4 py-3 text-[16px] transition-colors duration-200 focus:border-accent sm:w-[249.6px]"
        />
        <p id={dobHintId} className="text-[13px] text-ink-3">
          {C.birthdateHint}
        </p>
      </div>

      {state.error ? (
        <p id={errorId} role="alert" className="text-[13.9px] text-critical">
          {state.error}
        </p>
      ) : null}

      <StepActions step="profile_basics">
        <button
          type="submit"
          disabled={pending}
          className={buttonClass("primary", "w-full sm:w-auto sm:min-w-[182.4px] sm:self-start")}
        >
          {COPY.actions.continueLabel}
        </button>
      </StepActions>
    </form>
  );
}
