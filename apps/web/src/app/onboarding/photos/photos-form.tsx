"use client";

import { useActionState, useId, useState, useTransition } from "react";

import { downscalePhoto, isTooLargeToSend } from "@/lib/downscale";
import { ACCEPTED_TYPES, MAX_PHOTOS } from "@/lib/photo-limits";
import { COPY, DRAFT_COPY } from "@plusone/config";

import { savePhotoPrivacy, uploadPhoto } from "./actions";
import { PHOTOS_INITIAL } from "./state";
import { buttonClass } from "@/app/ui";

const C = DRAFT_COPY.photos;

export function PhotoUploader({ count }: { count: number }) {
  /**
   * The action is called directly rather than through useActionState.
   *
   * Several files now arrive at once and they have to go up ONE AT A TIME:
   * `position` is chosen by counting existing rows and `unique (user_id,
   * position)` refuses a duplicate, so two uploads in flight read the same
   * count and one of them loses. Sequencing means awaiting each result, and a
   * useActionState dispatch returns nothing to await.
   *
   * Calling it from an event handler inside startTransition is the documented
   * way — and revalidatePath still lands, because Next re-renders the route and
   * returns the new payload in the action's own response.
   */
  const [pending, startUploading] = useTransition();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  /**
   * Shrink first, then send.
   *
   * The server resizes to 1600px regardless, so uploading the original meant
   * carrying 10–20MB of phone camera across someone's mobile data to have it
   * discarded at the other end — and it could not even arrive: a modern photo
   * passes our own 8MB check and then exceeds the Server Action body cap.
   *
   * The downscale is a convenience, not a check. The server still validates the
   * type and the size and still strips the metadata; if the browser cannot do
   * this, the original goes as before and the server decides.
   */
  function onPick(picked: File[]) {
    setError(null);

    // How many will fit, decided before anything is sent. The database can only
    // hold six, and finding that out one row at a time reads as a broken upload.
    const room = MAX_PHOTOS - count;
    if (room <= 0) {
      setError(C.errors.full(MAX_PHOTOS));
      return;
    }
    const queue = picked.slice(0, room);
    const overflowed = picked.length > queue.length;

    startUploading(async () => {
      for (const [index, file] of queue.entries()) {
        setProgress({ done: index + 1, total: queue.length });

        const { file: prepared } = await downscalePhoto(file);
        if (isTooLargeToSend(prepared)) {
          setError(C.errors.tooLargeToShrink);
          break;
        }

        const formData = new FormData();
        formData.set("photo", prepared);
        const result = await uploadPhoto(PHOTOS_INITIAL, formData);

        // Stop on the first refusal rather than pushing the rest at a server
        // that has just said no — and keep the reason, which the next
        // iteration's setError(null) would otherwise wipe.
        if (result.error) {
          setError(result.error);
          break;
        }
      }

      setProgress(null);
      if (overflowed) setError(C.errors.full(MAX_PHOTOS));
    });
  }

  return (
    // Not a <form>. onPick dispatches the action itself after shrinking each
    // file, so a form action here would be a second submit carrying originals.
    <div className="mt-10 flex flex-col gap-5">
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
        multiple
        accept={ACCEPTED_TYPES.join(",")}
        className="sr-only"
        disabled={pending}
        onChange={(event) => {
          const picked = Array.from(event.currentTarget.files ?? []);
          // Cleared so picking the same file again still fires a change.
          event.currentTarget.value = "";
          if (picked.length > 0) onPick(picked);
        }}
      />

      {/* Picking a file starts an upload with no button press, so the only
          thing that says anything is happening is this line. */}
      <p role="status" className="text-[14.5px] text-ink-3">
        {progress ? C.uploading(progress.done, progress.total) : pending ? C.errors.preparing : ""}
      </p>

      {error ? (
        <p role="alert" className="text-[14.5px] text-critical">
          {error}
        </p>
      ) : null}

      <p role="status" className="text-[14.5px] text-ink-3">
        {count > 0 ? C.added(count) : ""}
      </p>
    </div>
  );
}

export function PrivacyChoice({ canContinue }: { canContinue: boolean }) {
  const blockedId = useId();
  const [state, action, pending] = useActionState(savePhotoPrivacy, PHOTOS_INITIAL);

  return (
    <form action={action} className="mt-12 flex flex-col gap-8">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-[15px]">{C.privacyLabel}</legend>

        <label className="ease-brand flex cursor-pointer items-center min-h-tap gap-3.5 rounded-lg border border-line-control bg-surface px-4 py-3.5 text-[16px] transition-colors duration-200 has-checked:border-accent">
          <input
            type="radio"
            name="photo_privacy"
            value="clear"
            defaultChecked
            className="size-[18px] accent-accent"
          />
          {C.clearLabel}
        </label>

        <label className="ease-brand flex cursor-pointer items-start gap-3.5 rounded-lg border border-line-control bg-surface px-4 py-3.5 text-[16px] transition-colors duration-200 has-checked:border-accent">
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
        className={buttonClass("primary", "w-full sm:w-auto sm:min-w-[190px] sm:self-start")}
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
