"use client";

import { useActionState } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { buttonClass } from "@/app/ui";
import { setReadReceiptsHidden, type ReadReceiptsState } from "./read-receipts-actions";

const C = DRAFT_COPY.app;

/**
 * Turning your read receipts off, and back on.
 *
 * The mirror image of `IncognitoToggle` in every respect except the default.
 * Incognito starts off and premium turns it on; receipts start ON for everybody
 * and premium turns them off. Same gate, same lapse rule, opposite resting
 * state — because the transparent state is the one this product ships, and
 * "nobody gets ghosted" is the line on the front page.
 *
 * **Un-hiding is offered whatever the premium state.** A member whose
 * subscription lapsed while hidden must not be trapped behind a paywall holding
 * a setting they cannot undo — that sells the exit rather than the feature.
 * `set_read_receipts_hidden()` refuses only the hiding direction and this button
 * mirrors it.
 */
export function ReadReceiptsToggle({ hidden, isPremium }: { hidden: boolean; isPremium: boolean }) {
  const [state, action, pending] = useActionState<ReadReceiptsState, FormData>(
    setReadReceiptsHidden,
    { error: null },
  );
  const current = state.error == null && state.hidden != null ? state.hidden : hidden;

  // Hidden and lapsed is the state to be careful about: they stay hidden, they
  // can still come back, and they are not told they are broken.
  const canHide = isPremium;

  return (
    <div className="mt-5">
      <p className="text-[12.6px] leading-[1.65] text-ink-2">
        {current ? C.readReceiptsHiddenNote : C.readReceiptsShownNote}
      </p>

      {current && !isPremium ? (
        <p className="mt-3 text-[11.7px] leading-[1.6] text-ink-3">{C.readReceiptsLapsedNote}</p>
      ) : null}

      <form action={action} className="mt-4">
        <input type="hidden" name="hidden" value={current ? "0" : "1"} />
        <button
          type="submit"
          disabled={pending || (!current && !canHide)}
          className={buttonClass(current ? "secondary" : "primary")}
        >
          {current ? C.readReceiptsShow : C.readReceiptsHide}
        </button>
      </form>

      {!current && !canHide ? (
        <p className="mt-3 text-[11.7px] text-ink-3">{C.readReceiptsNeedsPremium}</p>
      ) : null}

      {state.error ? <p className="mt-3 text-[11.7px] text-danger">{state.error}</p> : null}
    </div>
  );
}
