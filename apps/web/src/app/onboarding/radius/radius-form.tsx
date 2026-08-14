"use client";

import { useActionState, useId, useState } from "react";

import { DRAFT_COPY, RADIUS } from "@plusone/config";

import { saveRadius, type RadiusState } from "./actions";

const C = DRAFT_COPY.radius;
const INITIAL: RadiusState = { error: null };

export function RadiusForm() {
  const [state, action, pending] = useActionState(saveRadius, INITIAL);
  // RADIUS.defaultMi is `as const`, so it infers as the literal 50 and the state
  // would refuse every other value.
  const [radius, setRadius] = useState<number>(RADIUS.defaultMi);
  const sliderId = useId();

  return (
    <form action={action} className="mt-10 flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <label htmlFor={sliderId} className="text-[15px]">
          {C.label}
        </label>

        <output
          htmlFor={sliderId}
          className="font-display text-[clamp(2.4rem,8vw,3.2rem)] leading-none"
        >
          {C.unit(radius)}
        </output>

        <input
          id={sliderId}
          name="radius"
          type="range"
          min={5}
          max={250}
          step={5}
          value={radius}
          onChange={(event) => setRadius(Number(event.target.value))}
          className="accent-accent"
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-[14.5px] text-critical">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="ease-brand w-full rounded-lg bg-accent px-6 py-3.5 text-[16px] text-accent-ink transition-[opacity,transform] duration-200 hover:opacity-90 active:scale-[0.995] disabled:opacity-55 sm:w-auto sm:min-w-[190px] sm:self-start"
      >
        {C.continueLabel}
      </button>
    </form>
  );
}
