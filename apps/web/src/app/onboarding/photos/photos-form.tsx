"use client";

import { useActionState, useId } from "react";

import { ACCEPTED_TYPES } from "@/lib/photo-limits";
import { COPY, DRAFT_COPY } from "@plusone/config";

import { PHOTOS_INITIAL, savePhotoPrivacy, uploadPhoto } from "./actions";

const C = DRAFT_COPY.photos;

export function PhotoUploader({ count }: { count: number }) {
  const [state, action, pending] = useActionState(uploadPhoto, PHOTOS_INITIAL);
  const inputId = useId();

  return (
    <form action={action} className="mt-10 flex flex-col gap-5">
      <label
        htmlFor={inputId}
        // focus-within, because the real input is sr-only. A keyboard user
        // tabbed to it and NOTHING on screen changed — the only visible thing
        // is this label, and the focus ring was on the clipped input.
        className="ease-brand flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-line-2 bg-surface px-6 py-10 text-[15.5px] text-ink-2 transition-colors duration-200 hover:border-accent hover:text-ink focus-within:border-accent focus-within:text-ink focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--accent)]"
      >
        {C.addLabel}
      </label>
      <input
        id={inputId}
        name="photo"
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        required
        className="sr-only"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      />

      {/* The form auto-submits on change, so picking a file starts an upload
          with no button press and no announcement — total silence from choosing
          the file through to the result. */}
      <p role="status" className="text-[14.5px] text-ink-3">
        {pending ? "Uploading…" : ""}
      </p>

      {state.error ? (
        <p role="alert" className="text-[14.5px] text-critical">
          {state.error}
        </p>
      ) : null}

      <p role="status" className="text-[14.5px] text-ink-3">
        {count > 0 ? `${count} ${count === 1 ? "photo" : "photos"} added.` : ""}
      </p>
    </form>
  );
}

export function PrivacyChoice({ canContinue }: { canContinue: boolean }) {
  const blockedId = useId();
  const [state, action, pending] = useActionState(savePhotoPrivacy, PHOTOS_INITIAL);

  return (
    <form action={action} className="mt-12 flex flex-col gap-8">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-[15px]">{C.privacyLabel}</legend>

        <label className="ease-brand flex cursor-pointer items-center gap-3.5 rounded-lg border border-line-2 bg-surface px-4 py-3.5 text-[16px] transition-colors duration-200 has-checked:border-accent">
          <input
            type="radio"
            name="photo_privacy"
            value="clear"
            defaultChecked
            className="size-[18px] accent-accent"
          />
          {C.clearLabel}
        </label>

        <label className="ease-brand flex cursor-pointer items-start gap-3.5 rounded-lg border border-line-2 bg-surface px-4 py-3.5 text-[16px] transition-colors duration-200 has-checked:border-accent">
          <input
            type="radio"
            name="photo_privacy"
            value="blurred_until_connected"
            className="mt-1 size-[18px] shrink-0 accent-accent"
          />
          <span>
            {C.blurredLabel}
            <span className="mt-1.5 block text-[13.5px] text-ink-3">{C.blurredHint}</span>
          </span>
        </label>
      </fieldset>

      {state.error ? (
        <p role="alert" className="text-[14.5px] text-critical">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !canContinue}
        // The reason it is disabled was a loose <p> associated with nothing,
        // and a disabled button is skipped in the tab order — so a member who
        // could not continue was never told why by anything they would reach.
        aria-describedby={!canContinue ? blockedId : undefined}
        className="ease-brand w-full rounded-lg bg-accent px-6 py-3.5 text-[16px] text-accent-ink transition-[opacity,transform] duration-200 hover:opacity-90 active:scale-[0.995] disabled:opacity-55 sm:w-auto sm:min-w-[190px] sm:self-start"
      >
        {COPY.actions.continueLabel}
      </button>

      {!canContinue ? (
        <p id={blockedId} className="text-[14px] text-ink-3">
          {C.errors.required}
        </p>
      ) : null}
    </form>
  );
}
