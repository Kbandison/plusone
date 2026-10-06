"use client";

import { useActionState, useId } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { Field, Submit } from "@/app/auth-fields";
import { attachInviteCode } from "./invite-actions";
import { INVITE_CODE_INITIAL } from "./state";

const C = DRAFT_COPY.phone;

/**
 * "Have an invitation code?" — folded away under the signup form.
 *
 * Folded because most people signing up have no code, and an open field asking
 * for one reads as a requirement. `attached` comes from the page, which has
 * already checked the cookie, so somebody who arrived through their link sees
 * the confirmation rather than a question they have already answered.
 */
export function InviteCodeField({ attached }: { attached: boolean }) {
  const [state, act, pending] = useActionState(attachInviteCode, INVITE_CODE_INITIAL);
  const id = useId();

  if (attached || state.attached) {
    return (
      <p role="status" className="mt-8 text-[13px] leading-[1.6] text-ink-2">
        {C.inviteAttached}
      </p>
    );
  }

  return (
    <details className="mt-8" open={state.error ? true : undefined}>
      <summary className="ease-brand inline-flex min-h-tap cursor-pointer items-center text-[13px] text-ink-2 underline decoration-line-control underline-offset-4 transition-colors duration-300 hover:text-ink">
        {C.inviteSummary}
      </summary>
      <form action={act} className="mt-4 flex flex-col gap-4">
        <Field
          id={id}
          label={C.inviteLabel}
          hint={C.inviteHint}
          error={state.error}
          name="invite_code"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          required
        />
        <Submit label={C.inviteSubmit} pending={pending} />
      </form>
    </details>
  );
}
