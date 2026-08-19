"use client";

import { useActionState } from "react";

import { COPY } from "@plusone/config";

import { switchMode } from "./actions";
import { type ProfileState } from "./state";
import { PROFILE_INITIAL } from "./state";
import { buttonClass } from "@/app/ui";

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
      <h2 className="text-[1.126rem]">Support-only mode</h2>
      <p className="mt-4 text-[14px] leading-[1.7] text-ink-2">{COPY.supportOnly.toggle}</p>

      <form action={act} className="mt-6">
        <input type="hidden" name="mode" value={target} />
        <button type="submit" disabled={pending} className={buttonClass("secondary")}>
          {mode === "dating" ? "Switch to support-only" : "Switch to dating"}
        </button>
      </form>

      {state.error ? (
        <p role="alert" className="mt-4 text-[13px] text-critical">
          {state.error}
        </p>
      ) : null}
      {/* role="status" — switching mode is one of the biggest changes a member
          can make here, and it produced no announcement at all. */}
      {state.message ? (
        <p role="status" className="mt-4 text-[13px] text-positive">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
