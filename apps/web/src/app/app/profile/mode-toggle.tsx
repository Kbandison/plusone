"use client";

import { useActionState } from "react";

import { COPY } from "@plusone/config";

import { PROFILE_INITIAL, switchMode, type ProfileState } from "./actions";

/**
 * §3.4's support-only copy, verbatim. It explains what the mode does in the
 * member's terms — what stops, and what does not — which is the difference
 * between a shield someone trusts and a switch they are afraid to touch.
 */
export function ModeToggle({ mode }: { mode: "dating" | "support_only" }) {
  const [state, act, pending] = useActionState<ProfileState, FormData>(switchMode, PROFILE_INITIAL);
  const target = mode === "dating" ? "support_only" : "dating";

  return (
    <section className="mt-10 rounded-xl border border-line-2 bg-surface p-6">
      <h2 className="text-[1.25rem]">Support-only mode</h2>
      <p className="mt-4 text-[15.5px] leading-[1.7] text-ink-2">{COPY.supportOnly.toggle}</p>

      <form action={act} className="mt-6">
        <input type="hidden" name="mode" value={target} />
        <button
          type="submit"
          disabled={pending}
          className="ease-brand rounded-lg border border-line-2 px-5 py-2.5 text-[15px] transition-colors duration-200 hover:border-accent disabled:opacity-55"
        >
          {mode === "dating" ? "Switch to support-only" : "Switch to dating"}
        </button>
      </form>

      {state.error ? (
        <p role="alert" className="mt-4 text-[14.5px] text-critical">
          {state.error}
        </p>
      ) : null}
      {state.message ? <p className="mt-4 text-[14.5px] text-positive">{state.message}</p> : null}
    </section>
  );
}
