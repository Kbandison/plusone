"use client";

import { useActionState } from "react";

import { COPY, DRAFT_COPY, INTENTION_LABELS, type Intention } from "@plusone/config";

import { saveIntention } from "./actions";
import { type IntentionState } from "./state";
import { buttonClass } from "@/app/ui";
import { StepActions } from "@/app/onboarding/step-actions";

const C = DRAFT_COPY.intention;
const INITIAL: IntentionState = { error: null };

export function IntentionForm({ intention }: { intention: string | null }) {
  const [state, action, pending] = useActionState(saveIntention, INITIAL);

  return (
    <form action={action} className="mt-10 flex flex-col gap-8">
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">{C.heading}</legend>
        {(Object.keys(INTENTION_LABELS) as Intention[]).map((value) => (
          <label
            key={value}
            className="ease-brand flex cursor-pointer items-center min-h-tap gap-3.5 rounded-lg border border-line-control bg-surface px-4 py-3.5 text-[13px] transition-colors duration-300 has-checked:border-accent"
          >
            <input
              type="radio"
              name="intention"
              value={value}
              defaultChecked={intention === value}
              required
              className="size-[14.6px] accent-accent"
            />
            {INTENTION_LABELS[value]}
          </label>
        ))}
      </fieldset>

      {/* §3.4, verbatim. The lock is the point: an intention that can be changed
          hourly tells nobody anything. */}
      <p className="text-[11.7px] text-ink-3">{COPY.intention.lockNotice}</p>

      {state.error ? (
        <p role="alert" className="text-[11.7px] text-critical">
          {state.error}
        </p>
      ) : null}

      <StepActions step="intention">
        <button
          type="submit"
          disabled={pending}
          className={buttonClass("primary", "w-full sm:w-auto sm:min-w-[153.9px] sm:self-start")}
        >
          {COPY.actions.continueLabel}
        </button>
      </StepActions>
    </form>
  );
}
