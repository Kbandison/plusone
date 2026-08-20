"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { Modal } from "@/app/modal";
import { buttonClass } from "@/app/ui";
import { downscalePhoto } from "@/lib/downscale";
import { ACCEPTED_TYPES } from "@/lib/photo-limits";
import { postToRoom } from "./actions";
import { ROOM_INITIAL } from "./state";

const C = DRAFT_COPY.app;

/**
 * Writing a post, in a dialog.
 *
 * The room page shows a box the width of the column and nothing else. It is not
 * a field — it is a way in — because everything a post can now carry (words, a
 * photograph, the choice to be anonymous) does not fit on one line, and the
 * previous version put a picker and a checkbox under every room whether or not
 * anybody was writing.
 *
 * The Post button goes with it. A button beside a box you have to leave anyway
 * is a second thing to press for one action.
 */
export function RoomCompose({ roomId }: { roomId: string }) {
  return (
    <Modal
      heading={C.roomComposeHeading}
      triggerClassName="ease-brand mt-4 w-full rounded-xl border border-line-control bg-surface px-4 py-3.5 text-left text-[13px] text-ink-3 transition-colors duration-200 hover:border-ink-3"
      trigger={C.roomComposeOpen}
    >
      {(close) => <ComposeForm roomId={roomId} onPosted={close} />}
    </Modal>
  );
}

function ComposeForm({ roomId, onPosted }: { roomId: string; onPosted: () => void }) {
  const [state, act, pending] = useActionState(postToRoom, ROOM_INITIAL);
  const [preview, setPreview] = useState<string | null>(null);
  // Shrinking happens before the action is dispatched, so `pending` is still
  // false during it. Without this the button stays live through the slowest
  // part of posting a photograph, which is the part that looks broken.
  const [preparing, setPreparing] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  // Closed once the post has actually landed.
  //
  // A submission is in flight while `pending`, and ROOM_INITIAL is also
  // {error: null} — so "no error" alone is true before anything is sent. This
  // waits for a send to have been in flight, the same shape the chat composer's
  // draft-clearing needed for the same reason.
  const form = useRef<HTMLFormElement>(null);

  /**
   * Closed and emptied when the post actually lands.
   *
   * This watched `pending` go true and then false with no error — which looked
   * like success and was not. ROOM_INITIAL is also {error: null}, so "no error"
   * is true before anything is sent; and seeing the transition at all depends
   * on React rendering both halves of it, which it does not have to. Batched,
   * the composer never noticed, never cleared itself and never closed — so the
   * dialog stayed open with the photograph in it, and the next render put it
   * back on screen.
   *
   * state.posted changes on every success, so the effect runs because a value
   * changed rather than because a sequence was inferred.
   */
  useEffect(() => {
    if (!state.posted) return;
    form.current?.reset();
    clearImage();
    onPosted();
  }, [state.posted, onPosted]);

  // Object URLs are a leak if nothing revokes them: the browser holds the file
  // alive until told otherwise, and a member trying three photographs would
  // leave three in memory.
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  function choose(file: File | null) {
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return file ? URL.createObjectURL(file) : null;
    });
    setName(file?.name ?? null);
  }

  // Function declarations, not consts: the effect above runs before either
  // would have been initialised otherwise, and a composer that clears itself
  // after posting is exactly when that matters.
  function clearImage() {
    choose(null);
    if (picker.current) picker.current.value = "";
  }

  return (
    <form
      ref={form}
      action={async (formData) => {
        // Shrunk in the browser, before it crosses anybody's mobile data.
        //
        // The server resizes to 1600px anyway, so sending a 12MB camera
        // original was carrying it across a phone connection to have it thrown
        // away at the other end — which is most of the wait between pressing
        // Post and the post appearing. onboarding/photos-form has done this
        // since it was built; this form was uploading the original.
        //
        // An optimisation, not a trust boundary: the server still checks the
        // type and size, still strips the metadata, still re-encodes. A browser
        // that cannot do this sends the original and nothing downstream
        // changes.
        const file = formData.get("image");
        if (file instanceof File && file.size > 0) {
          setPreparing(true);
          try {
            formData.set("image", (await downscalePhoto(file)).file);
          } finally {
            setPreparing(false);
          }
        }
        act(formData);
      }}
      className="mt-5 flex flex-col gap-4"
    >
      <input type="hidden" name="room_id" value={roomId} />

      <textarea
        name="body"
        rows={5}
        maxLength={2000}
        /* No autoFocus.
         *
         * On a phone it raised the keyboard the instant the dialog opened,
         * which resizes the visual viewport — and 100dvh on the layout behind,
         * plus the fixed grain overlay, re-lay out and repaint every time. Then
         * reaching for the photo picker dismissed it and returning raised it
         * again, so attaching an image meant three of those in a row.
         *
         * The field is the first thing in the dialog and a tap away. */
        placeholder={C.roomPostPlaceholder}
        // A placeholder is not a label: it is gone the moment a character is
        // typed, so a member who tabs back lands on an unnamed field.
        aria-label={C.roomPostPlaceholder}
        className="w-full rounded-xl border border-line-control bg-ground px-4 py-3 text-[16px] leading-[1.6] focus:border-accent"
      />

      {/* Shown before it is sent, which is the whole reason this is a dialog:
          a member attaching a photograph to a post in a room about their
          diagnosis should see exactly what they are about to share. */}
      {preview ? (
        <figure className="relative">
          {/* Not next/image: this is a blob: URL for a file that has not left
              the device, so there is nothing to optimise and no width to know
              in advance. */}
          {/* A box of a fixed height, holding an image of unknown one.
              max-h with no height meant the figure was nothing until the blob
              decoded and then jumped to whatever the photograph was — the
              dialog resized under it, and that jump is the flicker on
              attaching. The box is 320px before the image exists and 320px
              after, whatever arrives. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt={name ?? C.postImageAlt}
            decoding="async"
            className="h-[320px] w-full rounded-xl border border-line-2 bg-surface-2 object-contain"
          />
          <figcaption className="mt-2 flex items-center gap-3 text-[11px] text-ink-3">
            <span className="max-w-[20ch] truncate">{name}</span>
            <button
              type="button"
              onClick={clearImage}
              className="ease-brand underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
            >
              {C.postImageRemove}
            </button>
          </figcaption>
        </figure>
      ) : null}

      {/* A label wrapping a hidden input rather than a bare file control: the
          browser's own renders differently everywhere. The input keeps its
          name, so the form still carries the file. */}
      <label className="ease-brand inline-flex min-h-tap cursor-pointer items-center gap-2 self-start text-[12.2px] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink">
        <input
          ref={picker}
          type="file"
          name="image"
          // The types the server will actually take. A member picking a HEIC on
          // a phone would otherwise get as far as the upload before being told.
          accept={ACCEPTED_TYPES.join(",")}
          onChange={(event) => choose(event.target.files?.[0] ?? null)}
          className="sr-only text-[16px]"
        />
        {C.postImageLabel}
      </label>

      {/* Per post, and off by default. A default that hides everyone makes a
          room of strangers, and somebody who has decided to be anonymous will
          say so. */}
      <label className="flex items-start gap-3 text-[12.2px]">
        <input
          type="checkbox"
          name="anonymous"
          className="mt-0.5 size-[14.6px] shrink-0 accent-accent"
        />
        <span className="flex flex-col gap-1">
          {C.postAnonymousLabel}
          <span className="text-[11px] leading-[1.5] text-ink-3">{C.postAnonymousNote}</span>
        </span>
      </label>

      {state.error ? (
        <p role="alert" className="text-[11.7px] text-critical">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || preparing}
        className={buttonClass("primary", "self-start")}
      >
        {C.roomPostLabel}
      </button>
    </form>
  );
}
