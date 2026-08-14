"use client";

import { useActionState } from "react";

import { COPY, DRAFT_COPY } from "@plusone/config";

import { SETTINGS_INITIAL, requestDeletion, setCrossCommunityOptIn } from "./actions";

const C = DRAFT_COPY.app;

export function CrossCommunityToggle({ optIn }: { optIn: boolean }) {
  const [state, act, pending] = useActionState(setCrossCommunityOptIn, SETTINGS_INITIAL);

  return (
    <section className="mt-10 rounded-xl border border-line-2 bg-surface p-6">
      <h2 className="text-[1.2rem]">{C.crossCommunityHeading}</h2>
      {/* §3.4, verbatim. Both sides have to say yes — the copy says so because
          the wall works that way. */}
      <p className="mt-4 text-[15.5px] leading-[1.7] text-ink-2">{COPY.crossCommunity.optIn}</p>

      <form action={act} className="mt-5 flex items-center gap-3">
        <input
          id="cross_community"
          name="cross_community"
          type="checkbox"
          defaultChecked={optIn}
          className="size-[20px] accent-accent"
        />
        <label htmlFor="cross_community" className="text-[15px]">
          Open to other communities
        </label>
        <button
          type="submit"
          disabled={pending}
          className="ease-brand ml-auto rounded-lg border border-line-2 px-4 py-2 text-[14.5px] transition-colors duration-200 hover:border-accent disabled:opacity-55"
        >
          {COPY.actions.continueLabel}
        </button>
      </form>

      {state.error ? (
        <p role="alert" className="mt-3 text-[14px] text-critical">
          {state.error}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Deleting (§9.3, §3.4).
 *
 * The copy is verbatim and it is not softened anywhere: "This cannot be undone
 * — and we mean actually deleted." A product that says that has to make the
 * control match, so this asks the member to type the word rather than tap a
 * red button they could hit by accident.
 */
export function DeleteAccount() {
  const [state, act, pending] = useActionState(requestDeletion, SETTINGS_INITIAL);

  if (state.message) {
    return (
      <section className="mt-10 rounded-xl border border-line-2 bg-surface p-6">
        <h2 className="text-[1.2rem]">{C.deleteHeading}</h2>
        <p className="mt-4 text-[15.5px] leading-[1.7] text-ink-2">{state.message}</p>
      </section>
    );
  }

  return (
    <section className="mt-10 rounded-xl border border-line-2 bg-surface p-6">
      <h2 className="text-[1.2rem]">{C.deleteHeading}</h2>
      <p className="mt-4 text-[15.5px] leading-[1.7] text-ink-2">{COPY.deletion.confirmation}</p>

      <form action={act} className="mt-6 flex flex-col gap-4">
        <label htmlFor="confirm" className="text-[14px] text-ink-2">
          {C.deleteConfirmLabel}
        </label>
        <input
          id="confirm"
          name="confirm"
          type="text"
          autoComplete="off"
          className="w-full rounded-lg border border-line-2 bg-ground px-3.5 py-2.5 text-[15px] focus:border-critical focus:outline-none sm:w-[220px]"
        />

        {state.error ? (
          <p role="alert" className="text-[14px] text-critical">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="ease-brand self-start rounded-lg border border-critical px-5 py-2.5 text-[15px] text-critical transition-colors duration-200 hover:bg-critical hover:text-ground disabled:opacity-55"
        >
          {C.deleteButton}
        </button>
      </form>
    </section>
  );
}
