"use client";

import { useActionState } from "react";

import { COPY, DRAFT_COPY } from "@plusone/config";

import { addSignInEmail, requestDeletion, setCrossCommunityOptIn } from "./actions";
import { SETTINGS_INITIAL } from "./state";
import { buttonClass } from "@/app/ui";

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
          className="size-[18px] accent-accent"
        />
        <label htmlFor="cross_community" className="text-[15px]">
          Open to other communities
        </label>
        <button type="submit" disabled={pending} className={buttonClass("secondary", "ml-auto")}>
          {/* Not "Continue". There is nothing to continue to on a settings
              page, and a button whose name does not describe what it does
              fails 2.4.6 for everyone reading a list of controls. */}
          {DRAFT_COPY.app.saveLabel}
        </button>
      </form>

      {state.error ? (
        <p role="alert" className="mt-3 text-[14px] text-critical">
          {state.error}
        </p>
      ) : null}

      {/* This rendered only errors, so a successful toggle produced nothing at
          all — and the checkbox looks the same either way. */}
      {state.message ? (
        <p role="status" className="mt-3 text-[14px] text-positive">
          {state.message}
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
          className="w-full rounded-lg border border-line-2 bg-ground px-3.5 py-2.5 text-[16px] focus:border-critical sm:w-[220px]"
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

/**
 * The second way in.
 *
 * Deliberately in Settings rather than as an onboarding step: §7.2 fixes the
 * ten steps and their order, and this is not one of them. It also should not be
 * — signing up is already eight minutes, and a member has no reason to care
 * about a backup credential before they have an account worth backing up.
 */
export function SignInEmail({ email, confirmed }: { email: string | null; confirmed: boolean }) {
  const [state, act, pending] = useActionState(addSignInEmail, SETTINGS_INITIAL);
  const status =
    email === null ? C.emailNone : confirmed ? C.emailConfirmed(email) : C.emailPending(email);

  return (
    <section className="mt-10 rounded-xl border border-line-2 bg-surface p-6">
      <h2 className="text-[1.2rem]">{C.emailHeading}</h2>
      <p className="mt-4 text-[15.5px] leading-[1.7] text-ink-2">{C.emailBody}</p>
      <p className="mt-4 text-[15px] text-ink-2">{status}</p>

      <form action={act} className="mt-5 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2">
          <label htmlFor="sign_in_email" className="text-[15px]">
            {C.emailLabel}
          </label>
          <input
            id="sign_in_email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={email ?? ""}
            aria-describedby={state.error ? "sign_in_email-error" : undefined}
            aria-invalid={state.error ? true : undefined}
            className="ease-brand w-full rounded-lg border border-line-control bg-surface px-4 py-2.5 text-[16px] transition-colors duration-200 focus:border-accent sm:w-[300px]"
          />
        </div>
        <button type="submit" disabled={pending} className={buttonClass("secondary")}>
          {email === null ? C.emailAddLabel : C.emailChangeLabel}
        </button>
      </form>

      {state.error ? (
        <p id="sign_in_email-error" role="alert" className="mt-3 text-[14px] text-critical">
          {state.error}
        </p>
      ) : null}

      {state.message ? (
        <p role="status" className="mt-3 text-[14px] text-positive">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
