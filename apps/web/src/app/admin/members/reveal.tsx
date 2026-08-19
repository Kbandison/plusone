"use client";

import { useActionState } from "react";

import { revealCondition } from "../verifications/actions";
import { REVEAL_INITIAL } from "../verifications/state";
import { buttonClass } from "@/app/ui";

/**
 * §7.3 — "reveal requires explicit reason logged".
 *
 * The reason is not validated here. `admin_reveal_condition` refuses a short
 * one and writes the audit row in the SAME STATEMENT as the read, so the two
 * cannot come apart. Checking it here as well would only produce a nicer
 * message, and would risk reading like the check.
 */
export function RevealCondition({ memberId }: { memberId: string }) {
  const [state, act, pending] = useActionState(revealCondition, REVEAL_INITIAL);

  return (
    <details className="mt-5 border-t border-line pt-4">
      <summary className="cursor-pointer text-[11.7px] text-ink-2">Reveal condition data</summary>
      <p className="mt-3 text-[11px] text-ink-3">
        Most decisions do not need this. Every reveal is logged against your account with the reason
        you give.
      </p>
      <form action={act} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="user_id" value={memberId} />
        <input
          name="reason"
          type="text"
          required
          minLength={10}
          placeholder="Why you need it"
          aria-label="Why you need it"
          className="rounded-lg border border-line-2 bg-ground px-3.5 py-2.5 text-[16px] focus:border-accent"
        />
        <button type="submit" disabled={pending} className={buttonClass("secondary", "self-start")}>
          Reveal and log
        </button>
        {state.error ? (
          <p role="alert" className="text-[11.3px] text-critical">
            {state.error}
          </p>
        ) : null}
        {state.revealed ? (
          <p className="text-[12.2px]">
            {state.revealed.community} · {state.revealed.condition}
            {state.revealed.u_equals_u ? " · U=U" : ""}
          </p>
        ) : null}
      </form>
    </details>
  );
}
