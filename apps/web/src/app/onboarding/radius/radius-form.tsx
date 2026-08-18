"use client";

import { useActionState, useId, useState } from "react";

import { DRAFT_COPY, RADIUS } from "@plusone/config";

import { saveRadius } from "./actions";
import { type RadiusState } from "./state";
import { buttonClass } from "@/app/ui";
import { StepActions } from "@/app/onboarding/step-actions";

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

        {/* aria-hidden because the slider itself now announces this value
            through aria-valuetext. <output> carries an implicit role="status",
            so without this every drag step was announced twice. */}
        <output aria-hidden htmlFor={sliderId} className="font-display text-h1 leading-none">
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
          // Without this a screen reader announces the bare number while the
          // page says "50 miles". The unit is the part that matters.
          aria-valuetext={C.unit(radius)}
          onChange={(event) => setRadius(Number(event.target.value))}
          /* A native range is about 16px tall. LAYOUT.minTapTarget declares a
             44px floor and this was one of the controls ignoring it — on a
             phone it is a hairline to hit with a thumb. The height is padding
             around the track, so the control grows without the track doing. */
          className="min-h-tap w-full cursor-pointer accent-accent"
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-[14.5px] text-critical">
          {state.error}
        </p>
      ) : null}

      <StepActions step="radius">
        <button
          type="submit"
          disabled={pending}
          className={buttonClass("primary", "w-full sm:w-auto sm:min-w-[190px] sm:self-start")}
        >
          {C.continueLabel}
        </button>
      </StepActions>
    </form>
  );
}
