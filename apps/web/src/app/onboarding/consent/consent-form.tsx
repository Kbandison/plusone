"use client";

import { useActionState, useId } from "react";

import { COPY } from "@plusone/config";

import { grantHealthDataConsent } from "./actions";
import { type ConsentActionState } from "./state";

const INITIAL: ConsentActionState = { error: null };

/**
 * The §9.1 checkbox.
 *
 * Unbundled, in the sense the requirement means it: it is the only thing on
 * this screen, it starts unticked, and the submit button is disabled until it
 * is ticked. Nothing else rides along with the agreement.
 */
export function ConsentForm() {
  const [state, action, pending] = useActionState(grantHealthDataConsent, INITIAL);
  const checkboxId = useId();
  const errorId = useId();

  return (
    <form action={action} className="mt-10">
      <div className="flex items-start gap-3.5">
        <input
          id={checkboxId}
          name="agree"
          type="checkbox"
          required
          aria-describedby={state.error ? errorId : undefined}
          className="mt-[3px] size-[22px] shrink-0 accent-accent"
        />
        <label htmlFor={checkboxId} className="text-[15.5px] leading-[1.55]">
          {COPY.consent.checkboxLabel}
        </label>
      </div>

      {state.error ? (
        <p id={errorId} role="alert" className="mt-4 text-[14.5px] text-critical">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="ease-brand mt-9 w-full rounded-lg bg-accent px-6 py-3.5 text-[16px] text-accent-ink transition-[opacity,transform] duration-200 hover:opacity-90 active:scale-[0.995] disabled:opacity-55 sm:w-auto sm:min-w-[190px]"
      >
        {COPY.actions.continueLabel}
      </button>
    </form>
  );
}
