"use client";

import { useActionState, useId, useRef, useState } from "react";

import { locate } from "@/lib/locate";

import { DRAFT_COPY, RADIUS } from "@plusone/config";

import { saveRadius } from "./actions";
import { type RadiusState } from "./state";
import { buttonClass } from "@/app/ui";
import { StepActions } from "@/app/onboarding/step-actions";

const C = DRAFT_COPY.radius;
const INITIAL: RadiusState = { error: null };

export function RadiusForm({
  radiusMi,
  approximate,
  save,
}: {
  radiusMi?: number | null;
  /** From the request's IP. Used only if the device will not say. */
  approximate?: { lat: number; lon: number } | null;
  /**
   * The profile's action, which saves on release and stays put.
   *
   * Passed in rather than switched on a boolean so the onboarding step keeps
   * importing exactly one action and the profile keeps importing exactly one:
   * a `settings` flag would have put a redirect and a requireStep in the
   * bundle of a screen that must never reach either.
   */
  save?: (previous: RadiusState, formData: FormData) => Promise<RadiusState>;
}) {
  const settings = save !== undefined;
  const [state, action, pending] = useActionState(save ?? saveRadius, INITIAL);
  const form = useRef<HTMLFormElement>(null);
  /**
   * Whether this member has moved the slider yet.
   *
   * Without it the page loads already saying "Saved", which is a claim about an
   * action nobody took — and the one time it matters, when a save genuinely
   * fails, the word was on screen before the attempt and stays there after it.
   */
  const [touched, setTouched] = useState(false);
  const commit = () => {
    setTouched(true);
    form.current?.requestSubmit();
  };
  const [outcome, setOutcome] = useState<"asking" | "approximate" | "unknown" | null>(null);
  /**
   * True while the device is being asked.
   *
   * `pending` from useActionState only starts once the action is DISPATCHED,
   * and dispatch happens after the location is resolved — so for the whole
   * time the permission dialogue is up, the form had no pending state and the
   * button was a control that did nothing when pressed. That is what the bug
   * looked like from the outside even before it was one.
   */
  const [locating, setLocating] = useState(false);

  /**
   * Where the member is, asked for at the moment it means something.
   *
   * The prompt is fired on SUBMIT rather than on load. A permission dialogue
   * appearing the instant a screen renders is the thing people refuse by
   * reflex; one that appears when they press a button labelled with a distance
   * has a reason attached to it.
   *
   * The asking itself is `lib/locate.ts`, shared with the profile's update
   * button. Never blocks: a refusal, a timeout or a browser without
   * geolocation all fall through to the coarse IP position, and no position at
   * all still lets the member finish — they match nobody until one arrives,
   * which is exactly where they were standing before.
   */
  async function askWhere(): Promise<{ lat: number; lon: number } | null> {
    const { where, outcome } = await locate(approximate);
    if (outcome !== "exact") setOutcome(outcome);
    return where;
  }

  // RADIUS.defaultMi is `as const`, so it infers as the literal 50 and the state
  // would refuse every other value.
  //
  // Seeded from the row: the slider is controlled, so a member walking back
  // into this step used to find it snapped back to 50 whatever they had chosen,
  // and continuing would have written 50 over it.
  const [radius, setRadius] = useState<number>(radiusMi ?? RADIUS.defaultMi);
  const sliderId = useId();

  return (
    <form
      ref={form}
      action={
        settings
          ? action
          : async (formData) => {
              setLocating(true);
              try {
                const where = await askWhere();
                if (where) {
                  formData.set("lat", String(where.lat));
                  formData.set("lon", String(where.lon));
                }
              } finally {
                // In a finally, so a throw from the geolocation stack cannot
                // leave the button permanently disabled — which would be the
                // same dead control by another route.
                setLocating(false);
              }
              action(formData);
            }
      }
      className={settings ? "mt-6 flex flex-col gap-8" : "mt-10 flex flex-col gap-8"}
    >
      <div className="flex flex-col gap-4">
        <label htmlFor={sliderId} className={settings ? "sr-only" : "text-[12.2px]"}>
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
          {...(settings ? { onPointerUp: commit, onKeyUp: commit, onTouchEnd: commit } : {})}
          /* A native range is about 16px tall. LAYOUT.minTapTarget declares a
             44px floor and this was one of the controls ignoring it — on a
             phone it is a hairline to hit with a thumb. The height is padding
             around the track, so the control grows without the track doing. */
          className="min-h-tap w-full cursor-pointer accent-accent"
        />
      </div>

      {settings ? null : (
        <p className="max-w-[46ch] text-[11px] leading-[1.6] text-ink-3">{C.locationHint}</p>
      )}

      {outcome === "approximate" ? (
        <p role="status" className="text-[11px] text-ink-3">
          {C.locationDenied}
        </p>
      ) : null}

      {outcome === "unknown" ? (
        <p role="status" className="max-w-[46ch] text-[11px] leading-[1.6] text-critical">
          {C.locationUnknown}
        </p>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-[11.7px] text-critical">
          {state.error}
        </p>
      ) : null}

      {!settings ? (
        <StepActions step="radius">
          <button
            type="submit"
            disabled={pending || locating}
            className={buttonClass("primary", "w-full sm:w-auto sm:min-w-[153.9px] sm:self-start")}
          >
            {locating ? C.locating : C.continueLabel}
          </button>
        </StepActions>
      ) : touched ? (
        <p role="status" className="text-[11.3px] text-ink-3">
          {pending ? DRAFT_COPY.app.settingSaving : state.error ? "" : DRAFT_COPY.app.settingSaved}
        </p>
      ) : null}
    </form>
  );
}
