"use client";

import { useActionState } from "react";

import { COOLDOWNS, COPY, DRAFT_COPY } from "@plusone/config";

import { switchMode } from "./actions";
import { type ProfileState } from "./state";
import { PROFILE_INITIAL } from "./state";
import { buttonClass } from "@/app/ui";

/**
 * §3.4's support-only copy, verbatim. It explains what the mode does in the
 * member's terms — what stops, and what does not — which is the difference
 * between a shield someone trusts and a switch they are afraid to touch.
 */
export function ModeToggle({
  mode,
  /**
   * When dating becomes available again, already formatted, or null.
   *
   * Computed on the server beside the intention cooldown it mirrors — the date
   * arithmetic needs Date.now(), which a Server Component may call and a client
   * component re-renders against. Null both when there is no cooldown running
   * and when it has passed, so this component never has to know which.
   */
  datingAgainOn = null,
}: {
  mode: "dating" | "support_only";
  datingAgainOn?: string | null;
}) {
  const [state, act, pending] = useActionState<ProfileState, FormData>(switchMode, PROFILE_INITIAL);
  const target = mode === "dating" ? "support_only" : "dating";
  const locked = mode === "support_only" && datingAgainOn !== null;

  return (
    <section className="mt-10 rounded-xl border border-line-2 bg-surface p-6">
      <h2 className="text-[1.013rem]">Support-only mode</h2>
      <p className="mt-4 text-[12.6px] leading-[1.7] text-ink-2">{COPY.supportOnly.toggle}</p>

      {/* The cost of the switch, BEFORE it is made.
       *
       * Kevin flipped this to see what it did and could not flip it back: the
       * only place the thirty days were ever mentioned was the error on the way
       * out, a month later. An action that cannot be undone for a month has to
       * say so before it is taken.
       *
       * Two sentences rather than one, because they answer different questions.
       * In dating mode it is "what will this cost me"; in support-only it is
       * "when can I leave", which wants the date and not the duration. */}
      {mode === "dating" ? (
        <p className="mt-3 text-[12.2px] leading-[1.6] text-ink-3">
          {DRAFT_COPY.app.supportOnlyCooldown(COOLDOWNS.datingReentryDays)}
        </p>
      ) : locked ? (
        <p className="mt-3 text-[12.2px] leading-[1.6] text-ink-3">
          {DRAFT_COPY.app.supportOnlyLockedUntil(datingAgainOn)}
        </p>
      ) : null}

      <form action={act} className="mt-6">
        <input type="hidden" name="mode" value={target} />
        {/* Disabled while the cooldown is running, so the button does not offer
            a door that opens onto a wall — switch_mode raises, and the member
            would meet the refusal only after pressing. The wall is still the
            RPC's: this is the screen agreeing with it. */}
        <button type="submit" disabled={pending || locked} className={buttonClass("secondary")}>
          {mode === "dating" ? "Switch to support-only" : "Switch to dating"}
        </button>
      </form>

      {state.error ? (
        <p role="alert" className="mt-4 text-[11.7px] text-critical">
          {state.error}
        </p>
      ) : null}
      {/* role="status" — switching mode is one of the biggest changes a member
          can make here, and it produced no announcement at all. */}
      {state.message ? (
        <p role="status" className="mt-4 text-[11.7px] text-positive">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
