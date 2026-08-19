"use client";

import { useActionState, useId } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { saveBio } from "./actions";
import { PROFILE_INITIAL } from "./state";
import { buttonClass } from "@/app/ui";

const C = DRAFT_COPY.app;

/** Matches the tone check in saveBio, so the counter and the server agree. */
const MAX_CHARS = 500;

/**
 * Editing your bio.
 *
 * `saveBio` has existed since the profile actions were written and nothing
 * called it: the action, its tone check and its copy were all in place, and
 * there was no way to reach any of it. The same half-built shape as the purge
 * job with no delete button and the reports with no reader.
 */
export function BioEditor({ bio }: { bio: string | null }) {
  const [state, act, pending] = useActionState(saveBio, PROFILE_INITIAL);
  const fieldId = useId();
  const hintId = useId();

  return (
    <section className="mt-10 rounded-xl border border-line-2 bg-surface p-6">
      <h2 className="text-[1.08rem]">{C.bioHeading}</h2>

      <form action={act} className="mt-5 flex flex-col gap-3">
        <label htmlFor={fieldId} className="text-[13.6px]">
          {C.bioLabel}
        </label>
        <textarea
          id={fieldId}
          name="bio"
          rows={4}
          maxLength={MAX_CHARS}
          defaultValue={bio ?? ""}
          aria-describedby={hintId}
          className="rounded-lg border border-line-2 bg-ground px-3.5 py-2.5 text-[16px] focus:border-accent"
        />
        <p id={hintId} className="text-[12.2px] text-ink-3">
          {C.bioHint(MAX_CHARS)}
        </p>

        <button type="submit" disabled={pending} className={buttonClass("primary", "self-start")}>
          {C.saveLabel}
        </button>

        {state.error ? (
          <p role="alert" className="text-[12.6px] text-critical">
            {state.error}
          </p>
        ) : null}
        {state.message ? (
          <p role="status" className="text-[12.6px] text-positive">
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
