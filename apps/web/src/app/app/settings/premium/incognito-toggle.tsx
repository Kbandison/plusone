"use client";

import { useActionState } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { buttonClass } from "@/app/ui";
import { setIncognito, type IncognitoState } from "./incognito-actions";

const C = DRAFT_COPY.app;

/**
 * The incognito switch.
 *
 * A form rather than a checkbox that posts on change, because this one is worth
 * a deliberate press: it decides whether anybody who has not already connected
 * with you can see you at all, and a mis-tap either direction is a real
 * consequence rather than a filter to undo.
 *
 * **Turning it OFF is offered whatever the premium state**, and that is not an
 * oversight in the gating. A member whose subscription lapsed while incognito
 * must not be trapped invisible behind a paywall — that would be selling the
 * exit rather than the feature. `set_incognito()` refuses only the ON
 * direction, and this button mirrors it.
 */
export function IncognitoToggle({ on, isPremium }: { on: boolean; isPremium: boolean }) {
  const [state, action, pending] = useActionState<IncognitoState, FormData>(setIncognito, {
    error: null,
  });
  const current = state.error == null && state.on != null ? state.on : on;

  // On and lapsed is a real state and it is the one to be careful about: they
  // stay hidden, they can still leave, and they are not told they are broken.
  const canTurnOn = isPremium;

  return (
    <div className="mt-5">
      <p className="text-[12.6px] leading-[1.65] text-ink-2">
        {current ? C.incognitoOnNote : C.incognitoOffNote}
      </p>

      {current && !isPremium ? (
        <p className="mt-3 text-[11.7px] leading-[1.6] text-ink-3">{C.incognitoLapsedNote}</p>
      ) : null}

      <form action={action} className="mt-4">
        <input type="hidden" name="on" value={current ? "0" : "1"} />
        <button
          type="submit"
          disabled={pending || (!current && !canTurnOn)}
          className={buttonClass(current ? "secondary" : "primary")}
        >
          {current ? C.incognitoTurnOff : C.incognitoTurnOn}
        </button>
      </form>

      {!current && !canTurnOn ? (
        <p className="mt-3 text-[11.7px] text-ink-3">{C.incognitoNeedsPremium}</p>
      ) : null}

      {state.error ? (
        <p role="alert" className="mt-3 text-[11.7px] text-critical">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
