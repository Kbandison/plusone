"use client";

import { useActionState, useId, useState, useTransition } from "react";

import { downscalePhoto, isTooLargeToSend } from "@/lib/downscale";
import { ACCEPTED_TYPES, MAX_PHOTOS } from "@/lib/photo-limits";
import type { OwnPhoto } from "@/lib/photo-urls";
import { COPY, DRAFT_COPY } from "@plusone/config";

import { deletePhoto, reorderPhotos, savePhotoPrivacy, uploadPhoto } from "./actions";
import { PHOTOS_INITIAL } from "./state";
import { Badge, buttonClass } from "@/app/ui";
import { StepActions } from "@/app/onboarding/step-actions";

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
  const [preparing, setPreparing] = useState(false);
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
    // Too many CANCELS THE BATCH. It used to upload the ones that fit and then
    // complain, which is the worst of both: the member waits out six uploads to
    // be told something failed, and the six that arrived are whichever the file
    // picker happened to list first rather than the ones they would have
    // chosen. Nothing is sent, and the message says exactly that.
    if (picked.length > room) {
      setError(C.errors.tooMany(picked.length, room));
      return;
    }
    const queue = picked;

    startUploading(async () => {
      // Shrink them all first, in parallel.
      //
      // The uploads cannot overlap — `position` is chosen by counting rows and
      // `unique (user_id, position)` refuses a duplicate — but the shrinking is
      // pure browser work on independent files, and doing it inline meant every
      // upload waited on a canvas resize before it could even start. Six photos
      // paid that cost six times, one after another.
      setPreparing(true);
      let prepared: File[];
      try {
        prepared = await Promise.all(queue.map(async (file) => (await downscalePhoto(file)).file));
      } finally {
        setPreparing(false);
      }

      for (const [index, file] of prepared.entries()) {
        setProgress({ done: index + 1, total: prepared.length });

        if (isTooLargeToSend(file)) {
          setError(C.errors.tooLargeToShrink);
          break;
        }

        const formData = new FormData();
        formData.set("photo", file);
        const result = await uploadPhoto(PHOTOS_INITIAL, formData);

        // Stop on the first refusal rather than pushing the rest at a server
        // that has just said no.
        if (result.error) {
          setError(result.error);
          break;
        }
      }

      setProgress(null);
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

export function PrivacyChoice({
  canContinue,
  privacy,
}: {
  canContinue: boolean;
  /** Remembered, so walking back does not silently reset a member to "clear". */
  privacy?: string | null;
}) {
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
            defaultChecked={privacy !== "blurred_until_connected"}
            className="size-[18px] accent-accent"
          />
          {C.clearLabel}
        </label>

        <label className="ease-brand flex cursor-pointer items-start gap-3.5 rounded-lg border border-line-control bg-surface px-4 py-3.5 text-[16px] transition-colors duration-200 has-checked:border-accent">
          <input
            type="radio"
            name="photo_privacy"
            value="blurred_until_connected"
            defaultChecked={privacy === "blurred_until_connected"}
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

      <StepActions step="photos">
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
      </StepActions>

      {!canContinue ? (
        <p id={blockedId} className="text-[14px] text-ink-3">
          {C.errors.required}
        </p>
      ) : null}
    </form>
  );
}

/**
 * The photos themselves.
 *
 * The step counted them and never showed them: "3 photos added." and no way to
 * see which three, replace a bad one, or make room once the ceiling was hit. A
 * member who uploaded the wrong picture had no move left except a new account.
 *
 * Replace is delete-then-add rather than its own control. With six slots and a
 * visible grid, "remove that one, add another" is the same two taps and one
 * fewer concept — and it cannot half-fail the way an in-place swap can.
 */
export function PhotoGallery({ photos }: { photos: readonly OwnPhoto[] }) {
  const [removeState, remove, removing] = useActionState(deletePhoto, PHOTOS_INITIAL);
  const [moveState, move, moving] = useActionState(reorderPhotos, PHOTOS_INITIAL);
  if (photos.length === 0) return null;

  const busy = removing || moving;
  const error = removeState.error ?? moveState.error;

  return (
    <section className="mt-10">
      <h2 className="text-[15px]">{C.yoursHeading}</h2>
      <p className="mt-2 text-[13.5px] text-ink-3">{C.orderHint}</p>

      <ul className="mt-4 flex flex-wrap gap-4">
        {photos.map((photo, index) => (
          <li key={photo.id} className="flex w-24 flex-col gap-2">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed
                  storage URLs expire in ten minutes, so the image optimiser
                  would cache a URL that outlives its own signature. */}
              <img
                src={photo.url}
                alt=""
                width={96}
                height={96}
                className="size-24 rounded-lg border border-line-2 object-cover"
              />
              {/* Which one is the main is not decoration: it is the only photo
                  a card, a drop or a search result ever shows. */}
              {index === 0 ? (
                <Badge className="absolute bottom-1 left-1">{C.mainBadge}</Badge>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-1">
              <form action={move}>
                <input type="hidden" name="photo_id" value={photo.id} />
                <input type="hidden" name="move" value="earlier" />
                <button
                  type="submit"
                  disabled={busy || index === 0}
                  aria-label={C.moveEarlierNamed(index + 1)}
                  className={buttonClass("quiet", "px-1.5 text-[15px] disabled:opacity-30")}
                >
                  <span aria-hidden="true">&larr;</span>
                </button>
              </form>

              <form action={move}>
                <input type="hidden" name="photo_id" value={photo.id} />
                <input type="hidden" name="move" value="later" />
                <button
                  type="submit"
                  disabled={busy || index === photos.length - 1}
                  aria-label={C.moveLaterNamed(index + 1)}
                  className={buttonClass("quiet", "px-1.5 text-[15px] disabled:opacity-30")}
                >
                  <span aria-hidden="true">&rarr;</span>
                </button>
              </form>
            </div>

            {index > 0 ? (
              <form action={move}>
                <input type="hidden" name="photo_id" value={photo.id} />
                <input type="hidden" name="move" value="main" />
                <button
                  type="submit"
                  disabled={busy}
                  aria-label={C.makeMainNamed(index + 1)}
                  className={buttonClass("quiet", "text-[13px]")}
                >
                  {C.makeMainLabel}
                </button>
              </form>
            ) : null}

            <form action={remove}>
              <input type="hidden" name="photo_id" value={photo.id} />
              <button
                type="submit"
                disabled={busy}
                // Named, or a grid of identical "Remove" buttons is unusable by
                // ear — every one of them reads the same out of context.
                aria-label={C.removeNamed(index + 1)}
                className={buttonClass("quiet", "text-[13px]")}
              >
                {C.removeLabel}
              </button>
            </form>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[14px] text-ink-3">{C.roomLeft(MAX_PHOTOS - photos.length)}</p>

      {error ? (
        <p role="alert" className="mt-3 text-[14.5px] text-critical">
          {error}
        </p>
      ) : null}
    </section>
  );
}
