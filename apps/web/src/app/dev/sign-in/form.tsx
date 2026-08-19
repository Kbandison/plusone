"use client";

import { useActionState, useState } from "react";

import { devResetVerification, devSignIn } from "./actions";
import { DEV_SIGN_IN_INITIAL } from "./state";
import { buttonClass } from "@/app/ui";

/**
 * Four presets, because most of what there is to test needs more than one
 * member: a Drop needs a pool, a connect needs a recipient, a chat needs two
 * people, and a block needs somebody to block.
 *
 * Reserved test ranges, so these can never collide with a real number.
 */
const PRESETS = [
  { phone: "+15555550100", label: "Member one" },
  { phone: "+15555550101", label: "Member two" },
  { phone: "+15555550102", label: "Member three" },
  { phone: "+15555550103", label: "Member four" },
];

export function DevSignInForm() {
  const [state, act, pending] = useActionState(devSignIn, DEV_SIGN_IN_INITIAL);
  const [resetState, reset, resetting] = useActionState(devResetVerification, DEV_SIGN_IN_INITIAL);
  const [wasReset, setWasReset] = useState(false);

  return (
    <form action={act} className="mt-10 flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-[13.6px]">Sign in as</legend>
        {PRESETS.map((preset, index) => (
          <label
            key={preset.phone}
            className="ease-brand flex cursor-pointer items-center min-h-tap gap-3.5 rounded-lg border border-line-control bg-surface px-4 py-3.5 text-[14.4px] transition-colors duration-200 has-checked:border-accent"
          >
            <input
              type="radio"
              name="phone"
              value={preset.phone}
              defaultChecked={index === 0}
              className="size-[16.2px] accent-accent"
            />
            <span>
              {preset.label}
              <span className="ml-2 text-[12.6px] text-ink-3">{preset.phone}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <button type="submit" disabled={pending} className={buttonClass("primary", "self-start")}>
        {pending ? "Signing in…" : "Sign in"}
      </button>

      {state.error ? (
        <p role="alert" className="text-[13px] text-critical">
          {state.error}
        </p>
      ) : null}

      {/* Verification is one-way for members and that is correct — §7.2 runs
          liveness once. It also means one successful check burns the test
          account, and the cases worth exercising against a real provider are
          the failures: a low score, a retry, the flagged-for-review path at
          three attempts. This puts the selected member back at that step.

          `formAction` rather than a second <form>: forms cannot nest, and the
          member is chosen by the radio group above. */}
      <div className="mt-2 border-t border-line pt-6">
        <button
          type="submit"
          formAction={(formData) => {
            setWasReset(true);
            reset(formData);
          }}
          disabled={pending || resetting}
          className="ease-brand text-[13px] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink disabled:opacity-55"
        >
          {resetting ? "Resetting…" : "Reset this member's verification"}
        </button>

        {resetState.error ? (
          <p role="alert" className="mt-3 text-[13px] text-critical">
            {resetState.error}
          </p>
        ) : wasReset && !resetting ? (
          <p role="status" className="mt-3 text-[13px] text-positive">
            Back at the liveness step, with all three attempts again.
          </p>
        ) : null}
      </div>
    </form>
  );
}
