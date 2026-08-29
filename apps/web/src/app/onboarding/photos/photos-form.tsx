"use client";

import { useActionState, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { downscalePhoto, isTooLargeToSend } from "@/lib/downscale";
import { ACCEPTED_TYPES, MAX_PHOTOS } from "@/lib/photo-limits";
import type { OwnPhoto } from "@/lib/photo-urls";
import { COPY, DRAFT_COPY } from "@plusone/config";

import { deletePhoto, savePhotoPrivacy, setPhotoPrivacy, uploadPhoto } from "./actions";
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
    //
    // A TILE, sized like a photo and sitting beside the last one. It was a wide
    // dashed panel above the grid, which read as the subject of the screen —
    // and once there were photos to look at, the subject is the photos.
    <div className="flex flex-col items-center gap-2">
      <label
        htmlFor={inputId}
        // focus-within, because the real input is sr-only. A keyboard user
        // tabbed to it and NOTHING on screen changed — the only visible thing
        // is this label, and the focus ring was on the clipped input.
        className="ease-brand flex size-[106.9px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-control bg-surface text-center text-[11px] text-ink-2 transition-colors duration-200 hover:border-accent hover:text-ink focus-within:border-accent focus-within:text-ink focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--accent)]"
      >
        <span aria-hidden="true" className="text-[17.8px] leading-none">
          +
        </span>
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
      <p role="status" className="max-w-[106.9px] text-center text-[11px] text-ink-3">
        {preparing
          ? C.errors.preparing
          : progress
            ? C.uploading(progress.done, progress.total)
            : ""}
      </p>

      {error ? (
        <p role="alert" className="max-w-[16rem] text-center text-[11px] text-critical">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function PrivacyChoice({
  canContinue,
  privacy,
  settings = false,
}: {
  canContinue: boolean;
  /** Remembered, so walking back does not silently reset a member to "clear". */
  privacy?: string | null;
  /**
   * On the profile: no Continue, and the choice saves the moment it is made.
   *
   * A settings screen with a Save button is a screen that can be left in a
   * state the member believes they chose and the database has never heard of.
   * A step is different — there, Continue is the thing that means "I have
   * decided", and pressing it is the decision.
   */
  settings?: boolean;
}) {
  const blockedId = useId();
  const [state, action, pending] = useActionState(savePhotoPrivacy, PHOTOS_INITIAL);
  const form = useRef<HTMLFormElement>(null);
  /**
   * Whether this member has changed anything yet.
   *
   * Without it the page loads already saying "Saved", which is a claim about an
   * action nobody took — and the one time it matters, when a save genuinely
   * fails, the word was on screen before the attempt and stays there after it.
   */
  const [touched, setTouched] = useState(false);

  // requestSubmit rather than submit(): it runs validation and fires the submit
  // event, which is what React's action handling listens for.
  const saveNow = () => {
    if (!settings) return;
    setTouched(true);
    form.current?.requestSubmit();
  };

  return (
    <form ref={form} action={action} className="mt-12 flex flex-col gap-8">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-[12.2px]">{C.privacyLabel}</legend>

        <label className="ease-brand flex cursor-pointer items-center min-h-tap gap-3.5 rounded-lg border border-line-control bg-surface px-4 py-3.5 text-[13px] transition-colors duration-200 has-checked:border-accent">
          <input
            type="radio"
            name="photo_privacy"
            value="clear"
            defaultChecked={privacy !== "blurred_until_connected"}
            onChange={saveNow}
            className="size-[14.6px] accent-accent"
          />
          {C.clearLabel}
        </label>

        <label className="ease-brand flex cursor-pointer items-start gap-3.5 rounded-lg border border-line-control bg-surface px-4 py-3.5 text-[13px] transition-colors duration-200 has-checked:border-accent">
          <input
            type="radio"
            name="photo_privacy"
            value="blurred_until_connected"
            defaultChecked={privacy === "blurred_until_connected"}
            onChange={saveNow}
            className="mt-1 size-[14.6px] shrink-0 accent-accent"
          />
          <span>
            {C.blurredLabel}
            <span className="mt-1.5 block text-[11px] text-ink-3">{C.blurredHint}</span>
          </span>
        </label>
      </fieldset>

      {state.error ? (
        <p role="alert" className="text-[11.7px] text-critical">
          {state.error}
        </p>
      ) : null}

      {!settings ? (
        <StepActions step="photos">
          <button
            type="submit"
            disabled={pending || !canContinue}
            // The reason it is disabled was a loose <p> associated with nothing,
            // and a disabled button is skipped in the tab order — so a member who
            // could not continue was never told why by anything they would reach.
            aria-describedby={!canContinue ? blockedId : undefined}
            className={buttonClass("primary", "w-full sm:w-auto sm:min-w-[153.9px] sm:self-start")}
          >
            {COPY.actions.continueLabel}
          </button>
        </StepActions>
      ) : touched ? (
        <p role="status" className="text-[11.3px] text-ink-3">
          {pending ? DRAFT_COPY.app.settingSaving : state.error ? "" : DRAFT_COPY.app.settingSaved}
        </p>
      ) : null}

      {!settings && !canContinue ? (
        <p id={blockedId} className="text-[11.3px] text-ink-3">
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
export function PhotoGallery({
  photos,
  settings = false,
  premium = false,
  children,
}: {
  /**
   * On the profile rather than in onboarding.
   *
   * The step needs a heading over the grid because nothing else names it. The
   * profile already has one, and two headings for one grid is one of them
   * apologising for the other.
   */
  settings?: boolean;
  photos: readonly OwnPhoto[];
  /** Whether per-photo privacy can be SET (server 18b). Never whether it is kept. */
  premium?: boolean;
  /** The add tile, so it sits with the photos rather than above them. */
  children?: React.ReactNode;
}) {
  const [removeState, remove, removing] = useActionState(deletePhoto, PHOTOS_INITIAL);
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  // A plain fetch to a route handler, not a Server Action.
  //
  // A Server Action's response can carry a re-rendered RSC payload, and the
  // client cache is invalidated by `cookies.set` as well as by revalidation —
  // which reading the session makes possible on any call. Removing
  // revalidatePath stopped the images being re-signed and the page still
  // reloaded on every drop. Nothing about saving an arrangement needs the
  // router: the browser is already showing the result.
  const [saving, setSaving] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  // The order the member is looking at, which during a drag is ahead of the
  // server. Re-seeded whenever the server sends a different set — an upload or
  // a delete — but NOT on every render, or a drag would snap back mid-gesture.
  const [order, setOrder] = useState<readonly OwnPhoto[]>(photos);
  const signature = photos.map((photo) => photo.id).join(",");
  // useState rather than useRef, which is not a style choice. This is React's
  // documented shape for adjusting state when a prop changes, and it depends on
  // the previous value being part of the render's committed result: a render
  // that gets thrown away must throw the comparison away with it. A ref
  // survives that, so a discarded render would leave seeded already advanced
  // and the next one would skip the re-seed — the arrangement silently not
  // catching up to an upload.
  const [seeded, setSeeded] = useState(signature);
  if (seeded !== signature && !saving) {
    setSeeded(signature);
    setOrder(photos);
  }

  const [dragging, setDragging] = useState<string | null>(null);
  const tiles = useRef(new Map<string, HTMLElement>());
  const router = useRouter();

  function commit(next: readonly OwnPhoto[]) {
    setOrder(next);
    setOrderError(null);
    setSaving(true);
    void fetch("/api/photos/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.map((photo) => photo.id) }),
    })
      .then((response) => {
        // 409 is a stale list — the browser and the database disagree about
        // which photos exist. Not the member's doing and not theirs to fix; the
        // next render settles it.
        if (!response.ok && response.status !== 409) {
          setOrderError(C.errors.uploadFailed);
          return;
        }

        /**
         * Only on the profile, and only once the write landed.
         *
         * This grid is optimistic about its own order and nothing else on the
         * page is — the profile shows the member's own face beside their name,
         * read from photos[0] on the server, so dragging a different picture to
         * the front left the heading on the old one until a manual reload.
         *
         * Deliberately not in onboarding: there is no header there, and
         * /api/photos/order is a route handler precisely so that saving an
         * arrangement does not drag the router through a re-render and re-sign
         * every image. That reasoning still holds where nothing outside the
         * grid depends on the order.
         */
        if (settings) router.refresh();
      })
      .catch(() => setOrderError(C.errors.uploadFailed))
      .finally(() => setSaving(false));
  }

  function moveTo(id: string, index: number) {
    const from = order.findIndex((photo) => photo.id === id);
    if (from === -1 || index < 0 || index >= order.length || index === from) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(index, 0, moved);
    commit(next);
  }

  /** Which tile the pointer is over, by hit-testing the rendered rectangles. */
  function tileAt(x: number, y: number): string | null {
    for (const [id, node] of tiles.current) {
      const box = node.getBoundingClientRect();
      if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return id;
    }
    return null;
  }

  if (order.length === 0) {
    return <div className="mt-10 flex justify-center">{children}</div>;
  }

  return (
    <section className="mt-10">
      {settings ? null : (
        <>
          <h2 className="text-center text-[12.2px]">{C.yoursHeading}</h2>
          <p className="mx-auto mt-2 max-w-[34ch] text-center text-[11px] text-ink-3">
            {C.orderHint}
          </p>
        </>
      )}

      <ul className="mt-6 flex flex-wrap justify-center gap-4">
        {order.map((photo, index) => (
          <li
            key={photo.id}
            ref={(node) => {
              if (node) tiles.current.set(photo.id, node);
              else tiles.current.delete(photo.id);
            }}
            /**
             * Pointer events, not the HTML5 drag API.
             *
             * `draggable` fires nothing on a touchscreen — dragstart/dragover
             * simply do not exist there — so the whole gesture would have
             * worked on a desktop and been invisible on the phones most members
             * are holding. Pointer events are one code path for both.
             */
            onPointerDown={(event) => {
              // Not the trash: pressing it must not start a drag.
              if ((event.target as HTMLElement).closest("[data-no-drag]")) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragging(photo.id);
            }}
            onPointerMove={(event) => {
              if (dragging !== photo.id) return;
              const over = tileAt(event.clientX, event.clientY);
              if (!over || over === photo.id) return;
              const to = order.findIndex((other) => other.id === over);
              // Reordered live, so the gap follows the finger rather than
              // everything jumping into place when it lifts.
              const from = order.findIndex((other) => other.id === photo.id);
              if (to === -1 || from === -1) return;
              const next = [...order];
              const [moved] = next.splice(from, 1);
              if (moved) next.splice(to, 0, moved);
              setOrder(next);
            }}
            onPointerUp={() => {
              if (dragging !== photo.id) return;
              setDragging(null);
              commit(order);
            }}
            onPointerCancel={() => setDragging(null)}
            // Dragging is not available to a keyboard, and reordering is not
            // decoration — position 0 is the photo everybody sees. The arrows
            // do the same move without a visible control to press.
            tabIndex={0}
            aria-label={C.dragNamed(index + 1, order.length)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                moveTo(photo.id, index - 1);
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                moveTo(photo.id, index + 1);
              }
            }}
            className={`ease-brand relative touch-none transition-[transform,box-shadow] duration-150 ${
              dragging === photo.id ? "z-10 scale-105 cursor-grabbing shadow-lg" : "cursor-grab"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- signed
                storage URLs expire in ten minutes, so the image optimiser would
                cache a URL that outlives its own signature. */}
            <img
              src={photo.url}
              alt=""
              width={132}
              height={132}
              draggable={false}
              className="size-[106.9px] rounded-xl border border-line-2 object-cover select-none"
            />

            {index === 0 ? (
              <Badge className="absolute bottom-1.5 left-1.5">{C.mainBadge}</Badge>
            ) : null}

            <form action={remove} data-no-drag className="absolute -top-2 -right-2">
              <input type="hidden" name="photo_id" value={photo.id} />
              <button
                type="submit"
                disabled={removing}
                // Named, or a grid of identical bins is unusable by ear — every
                // one of them reads the same out of context.
                aria-label={C.removeNamed(index + 1)}
                className="ease-brand flex size-8 items-center justify-center rounded-full border border-line-2 bg-surface text-ink-2 shadow-sm transition-colors duration-200 hover:border-critical hover:text-critical disabled:opacity-40"
              >
                <TrashIcon />
              </button>
            </form>

            {/* Per-photo privacy (server 18b). Inside the tile, because a
                separate list of six dropdowns somewhere else would make the
                member match names to pictures. */}
            <div data-no-drag className="mt-1.5">
              <label className="sr-only" htmlFor={`privacy-${photo.id}`}>
                {C.perPhotoLabel}
              </label>
              <select
                id={`privacy-${photo.id}`}
                defaultValue={photo.photoPrivacy ?? ""}
                disabled={!premium}
                onChange={(event) => {
                  const value = event.target.value;
                  setPrivacyError(null);
                  void setPhotoPrivacy(
                    photo.id,
                    value === "" ? null : (value as "clear" | "blurred_until_connected"),
                  ).then((result) => {
                    if (!result.ok) setPrivacyError(C.perPhotoSaveFailed);
                  });
                }}
                // 16px, or iOS zooms the page on focus and never zooms back.
                className="w-[106.9px] rounded-lg border border-line-2 bg-surface px-1.5 py-1 text-[16px] disabled:opacity-50"
              >
                <option value="">{C.perPhotoFollow}</option>
                <option value="clear">{C.perPhotoClear}</option>
                <option value="blurred_until_connected">{C.perPhotoBlurred}</option>
              </select>
            </div>
          </li>
        ))}

        {children ? <li className="flex items-center">{children}</li> : null}
      </ul>

      {/* Said before the picker opens, not after seven files are chosen and
          refused. The add tile disappearing at six says the same thing a moment
          too late. */}
      <p className="mt-4 text-center text-[11px] text-ink-3">
        {C.roomLeft(MAX_PHOTOS - order.length)}
      </p>

      {/* Which photo is first stopped being an ordering decision the moment
          photos could differ. Said where the ordering happens. */}
      <p className="mx-auto mt-3 max-w-[52ch] text-center text-[11.3px] leading-[1.6] text-ink-3">
        {C.firstIsTheCard}
      </p>

      {!premium ? (
        <p className="mt-3 text-center text-[11.7px] text-ink-2">
          {C.perPhotoPremium}{" "}
          <Link
            href="/app/settings/premium"
            className="underline decoration-line-2 underline-offset-4"
          >
            {C.perPhotoPremiumLink}
          </Link>
        </p>
      ) : null}

      {/* A failed reorder is silent otherwise: the grid keeps showing the
          arrangement the member dragged while the database holds the old one. */}
      {(removeState.error ?? orderError ?? privacyError) ? (
        <p role="alert" className="mt-4 text-center text-[11.7px] text-critical">
          {removeState.error ?? orderError ?? privacyError}
        </p>
      ) : null}
    </section>
  );
}

/** Drawn rather than imported: one icon does not justify a dependency. */
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="size-[13.8px]">
      <path
        d="M4 7h16M10 4h4a1 1 0 0 1 1 1v2H9V5a1 1 0 0 1 1-1ZM6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M10 11v6M14 11v6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
