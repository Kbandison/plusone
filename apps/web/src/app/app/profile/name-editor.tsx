"use client";

import { useActionState } from "react";

import { DRAFT_COPY, MAX_DISPLAY_NAME } from "@plusone/config";

import { buttonClass } from "@/app/ui";
import { saveDisplayName } from "./name-actions";
import { NAME_INITIAL } from "./name-state";

const C = DRAFT_COPY.app;

/**
 * The name, editable.
 *
 * It was set once in onboarding and never again — and it is the word every
 * other member sees on every connect, every chat and every room post they did
 * not choose to write anonymously. A typo in it was permanent.
 *
 * The field carries the same 40-character ceiling the column has. Not because
 * the client is trusted with it — the action and the constraint both check —
 * but because being stopped at the moment of typing is kinder than being told
 * afterwards.
 */
export function NameEditor({ name }: { name: string }) {
  const [state, act, pending] = useActionState(saveDisplayName, NAME_INITIAL);

  return (
    <form action={act} className="mt-4 flex flex-wrap items-end gap-3">
      <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-[11px] tracking-[0.04em] text-ink-3 uppercase">
        {C.profileNameLabel}
        <input
          name="display_name"
          defaultValue={name}
          maxLength={MAX_DISPLAY_NAME}
          required
          className="min-w-0 rounded-lg border border-line-control bg-surface px-4 py-2.5 text-[16px] focus:border-accent"
        />
      </label>

      <button type="submit" disabled={pending} className={buttonClass("secondary")}>
        {C.profileNameSave}
      </button>

      {state.error ? (
        <p role="alert" className="w-full text-[11.3px] text-critical">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="w-full text-[11.3px] text-positive">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
