"use client";

import { useActionState, useState } from "react";

import { memberContact } from "./actions";
import { CONTACT_INITIAL } from "./state";

/**
 * Turn a masked contact into a whole one, and back.
 *
 * The roster ships `kb***@gmail.com` and `***0147`, which is enough to
 * recognise an account you own and not enough to be worth a screenshot. This is
 * for the other case: a row whose name means nothing to you.
 *
 * A button rather than a written reason. `RevealCondition` charges a sentence
 * because a diagnosis is what this app protects; a phone number is ordinary
 * administration, and pricing them alike would cheapen the one that matters.
 *
 * ── hide is local, and re-showing does not ask again ───────────────────────
 *
 * Once revealed the value stays in this component, so hiding is instant and so
 * is showing it a second time. The alternative — dropping the value and
 * re-fetching — would mean a row you glanced at and hid costs two requests to
 * look at twice, and would make `hide` feel like a slower `show`.
 *
 * That it can be hidden at all is the point: the reason this is masked by
 * default is that an admin screen gets photographed, and a reveal that could not
 * be undone would leave the screen more exposed than it started for as long as
 * the tab is open.
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
  const [open, setOpen] = useState(true);

  const linkClass =
    "ease-brand min-h-tap text-[11px] text-accent underline decoration-line-control underline-offset-4 transition-colors duration-300 hover:decoration-accent";

  if (state.shown && open) {
    return (
      <span className="flex flex-col gap-0.5">
        <span className="break-all">{state.email ?? "—"}</span>
        <span className="flex items-center gap-2">
          <span className="tabular-nums text-ink-2">{state.phone ?? "—"}</span>
          <button type="button" onClick={() => setOpen(false)} className={linkClass}>
            hide
          </button>
        </span>
      </span>
    );
  }

  // Already fetched, currently hidden. A plain button, not the form — asking the
  // server again for a value this component is still holding would be a second
  // request for nothing.
  if (state.shown) {
    return (
      <span className="flex flex-col gap-0.5">
        <span className="break-all text-ink-2">{emailMasked ?? "—"}</span>
        <span className="flex items-center gap-2">
          <span className="tabular-nums text-ink-2">{phoneMasked ?? "—"}</span>
          <button type="button" onClick={() => setOpen(true)} className={linkClass}>
            show
          </button>
        </span>
      </span>
    );
  }

  return (
    <form action={act} className="flex flex-col gap-0.5">
      <input type="hidden" name="userId" value={userId} />
      <span className="break-all text-ink-2">{emailMasked ?? "—"}</span>
      <span className="flex items-center gap-2">
        <span className="tabular-nums text-ink-2">{phoneMasked ?? "—"}</span>
        <button type="submit" disabled={pending} className={linkClass}>
          {pending ? "…" : "show"}
        </button>
      </span>
      {state.error ? <span className="text-[11px] text-danger">{state.error}</span> : null}
    </form>
  );
}
