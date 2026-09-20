"use client";

import { useActionState, useState } from "react";

import { locate } from "@/lib/locate";
import { buttonClass } from "@/app/ui";
import type { RadiusState } from "@/app/onboarding/radius/state";
import { updateMyLocation } from "./radius-actions";

const INITIAL: RadiusState = { error: null };

/**
 * "I have moved."
 *
 * ── its own button, not part of the slider ─────────────────────────────────
 *
 * The radius slider deliberately never asks the browser where you are — "a
 * permission prompt on every drag of a slider is a thing people learn to
 * dismiss". So this is pressed on purpose, which is the only honest way to ask
 * for a location permission, and it is the same argument the onboarding step
 * makes for firing its prompt on submit rather than on load.
 *
 * ── the pending state has to cover the DIALOGUE ────────────────────────────
 *
 * `pending` from useActionState starts when the action is dispatched, and
 * dispatch happens after the position resolves — so for the whole time the
 * permission dialogue is up there would be no pending state and the button
 * would be a control that did nothing when pressed. That is the exact bug the
 * onboarding step already carries a paragraph about; `asking` is what covers
 * the gap.
 */
export function UpdateLocation({
  approximate,
}: {
  /** From the request's IP. Used only if the device will not say. */
  approximate?: { lat: number; lon: number } | null;
}) {
  const [state, action, pending] = useActionState(updateMyLocation, INITIAL);
  const [asking, setAsking] = useState(false);
  const [done, setDone] = useState(false);
  const busy = asking || pending;

  return (
    <form
      action={async (formData) => {
        setAsking(true);
        setDone(false);
        try {
          const { where } = await locate(approximate);
          if (where) {
            formData.set("lat", String(where.lat));
            formData.set("lon", String(where.lon));
          }
        } finally {
          // In a finally, so a throw from the geolocation stack cannot leave
          // the button permanently disabled — the same dead control by another
          // route.
          setAsking(false);
        }
        await action(formData);
        setDone(true);
      }}
      className="mt-6"
    >
      <button type="submit" disabled={busy} className={buttonClass("secondary")}>
        {busy ? "Checking where you are…" : "Update my location"}
      </button>

      {/* One line, and only after a press. A screen that says "Saved" before
          anybody did anything is making a claim about an action nobody took. */}
      {done && state.error ? (
        <p role="alert" className="mt-3 text-[11.7px] text-critical">
          {state.error}
        </p>
      ) : null}
      {done && !state.error ? (
        <p role="status" className="mt-3 text-[11.7px] text-positive">
          Updated.
        </p>
      ) : null}
    </form>
  );
}
