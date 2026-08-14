"use client";

import { useActionState } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { LIVENESS_INITIAL, runLivenessCheck } from "./actions";

const C = DRAFT_COPY.liveness;

export function LivenessForm() {
  const [state, action, pending] = useActionState(runLivenessCheck, LIVENESS_INITIAL);

  // Out of attempts is not a rejection. §2 Decision #21 puts a human in the
  // loop on a risk flag, and this is what that looks like from the member's
  // side: told plainly, asked to do nothing.
  if (state.attemptsLeft === 0 && !state.error) {
    return (
      <div className="mt-10 rounded-lg border border-line-2 bg-surface p-6">
        <h2 className="text-[clamp(1.3rem,3.5vw,1.55rem)]">{C.flaggedHeading}</h2>
        <p className="mt-4 text-[16px] leading-[1.7] text-ink-2">{C.flaggedBody}</p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-10 flex flex-col gap-6">
      {state.error ? (
        <p role="alert" className="text-[14.5px] text-critical">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="ease-brand w-full rounded-lg bg-accent px-6 py-3.5 text-[16px] text-accent-ink transition-[opacity,transform] duration-200 hover:opacity-90 active:scale-[0.995] disabled:opacity-55 sm:w-auto sm:min-w-[210px] sm:self-start"
      >
        {pending ? C.checkingLabel : state.error ? C.retryLabel : C.startLabel}
      </button>

      {state.error ? (
        <p className="text-[14px] text-ink-3">{C.retriesLeft(state.attemptsLeft)}</p>
      ) : null}
    </form>
  );
}
