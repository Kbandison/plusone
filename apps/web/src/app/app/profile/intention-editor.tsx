"use client";

import { useActionState, useState } from "react";

import { COPY, DRAFT_COPY, INTENTION_LABELS, type Intention } from "@plusone/config";

import { buttonClass } from "@/app/ui";
import { changeIntentionSetting } from "./intention-actions";
import { NAME_INITIAL } from "./name-state";

const C = DRAFT_COPY.app;

/**
 * What you are here for, changeable — once every thirty days.
 *
 * The profile showed this as a line of read-only text with the lock notice
 * under it, which told a member the rule and gave them no way to use it. It is
 * the answer that decides who is in their Drop; being able to have been wrong
 * about it once is the point of a cooldown rather than a lock.
 *
 * While the clock is running the control is disabled and says the date it
 * frees up. Disabled is not the enforcement — change_intention refuses it in
 * the database, and the columns are not member-writable at all — it is just
 * the difference between being told now and being told after choosing.
 */
export function IntentionEditor({
  intention,
  changeableOn,
}: {
  intention: Intention | null;
  /** Already formatted by the server; null once the cooldown has run out. */
  changeableOn: string | null;
}) {
  const [state, act, pending] = useActionState(changeIntentionSetting, NAME_INITIAL);
  const [choice, setChoice] = useState<string>(intention ?? "");
  const locked = changeableOn !== null;

  return (
    <form action={act} className="mt-1.5 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <select
          name="intention"
          value={choice}
          disabled={locked || pending}
          onChange={(event) => setChoice(event.target.value)}
          aria-label={C.profileLookingFor}
          className="ease-brand min-h-tap rounded-lg border border-line-control bg-surface px-3.5 py-2 text-[16px] transition-colors duration-200 focus:border-accent disabled:cursor-not-allowed disabled:text-ink-3 disabled:opacity-60"
        >
          {intention ? null : <option value="">{C.profileNotSet}</option>}
          {(Object.keys(INTENTION_LABELS) as Intention[]).map((value) => (
            <option key={value} value={value}>
              {INTENTION_LABELS[value]}
            </option>
          ))}
        </select>

        {/* Only once there is something to save. A Save button next to an
            unchanged answer is a button that does nothing, and on a control
            with a thirty-day consequence that is worse than absent. */}
        {!locked && choice !== "" && choice !== intention ? (
          <button type="submit" disabled={pending} className={buttonClass("secondary")}>
            {C.saveLabel}
          </button>
        ) : null}
      </div>

      {/* §3.4, verbatim. The lock is what makes the answer mean something. */}
      <p className="text-[11.3px] text-ink-3">
        {locked ? C.profileIntentionLocked(changeableOn) : COPY.intention.lockNotice}
      </p>

      {state.error ? (
        <p role="alert" className="text-[11.3px] text-critical">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="text-[11.3px] text-positive">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
