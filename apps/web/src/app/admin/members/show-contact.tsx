"use client";

import { useActionState } from "react";

import { memberContact } from "./actions";
import { CONTACT_INITIAL } from "./state";

/**
 * Turn a masked contact into a whole one.
 *
 * The roster ships `kb***@gmail.com` and `***0147`, which is enough to
 * recognise an account you own and not enough to be worth a screenshot. This is
 * for the other case: a row whose name means nothing to you.
 *
 * A button rather than a written reason. `RevealCondition` charges a sentence
 * because a diagnosis is what this app protects; a phone number is ordinary
 * administration, and pricing them alike would cheapen the one that matters.
 */
export function ShowContact({
  userId,
  emailMasked,
  phoneMasked,
}: {
  userId: string;
  emailMasked: string | null;
  phoneMasked: string | null;
}) {
  const [state, act, pending] = useActionState(memberContact, CONTACT_INITIAL);

  if (state.shown) {
    return (
      <span className="flex flex-col gap-0.5">
        <span className="break-all">{state.email ?? "—"}</span>
        <span className="tabular-nums text-ink-2">{state.phone ?? "—"}</span>
      </span>
    );
  }

  return (
    <form action={act} className="flex flex-col gap-0.5">
      <input type="hidden" name="userId" value={userId} />
      <span className="break-all text-ink-2">{emailMasked ?? "—"}</span>
      <span className="flex items-center gap-2">
        <span className="tabular-nums text-ink-2">{phoneMasked ?? "—"}</span>
        <button
          type="submit"
          disabled={pending}
          className="ease-brand min-h-tap text-[11px] text-accent underline decoration-line-control underline-offset-4 transition-colors duration-300 hover:decoration-accent"
        >
          {pending ? "…" : "show"}
        </button>
      </span>
      {state.error ? <span className="text-[11px] text-danger">{state.error}</span> : null}
    </form>
  );
}
