"use client";

import { useActionState, useId } from "react";

import { COPY } from "@plusone/config";

import { grantHealthDataConsent } from "./actions";
import { type ConsentActionState } from "./state";
import { buttonClass } from "@/app/ui";

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
        className={buttonClass("primary", "mt-9 w-full sm:w-auto sm:min-w-[190px]")}
      >
        {COPY.actions.continueLabel}
      </button>
    </form>
  );
}
