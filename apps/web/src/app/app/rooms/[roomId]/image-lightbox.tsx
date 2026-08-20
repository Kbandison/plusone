"use client";

import { useEffect, useRef, useState } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { CloseIcon } from "@/app/modal";

const C = DRAFT_COPY.app;

/**
 * The photograph, filling the screen, with the post's counts under it.
 *
 * Its own dialog rather than the shared Modal: this one is edge to edge and
 * dark, has no heading and no panel, and the counts sit at the bottom rather
 * than the content flowing from the top. Every one of Modal's decisions is the
 * opposite of what a lightbox wants.
 *
 * The URL is minted on the server and passed in — see PostImage — so nothing
 * here knows or needs the storage path.
 */
export function ImageLightbox({
  src,
  alt,
  footer,
}: {
  src: string;
  alt: string;
  /** The like, comment and view counts, rendered by the server row. */
  footer: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={C.postImageOpen}
        aria-haspopup="dialog"
        /* z-20 so it sits above the link covering the row: the picture opens
           full screen, the rest of the post opens the thread. */
        className="ease-brand relative z-20 mt-2 block w-full cursor-zoom-in transition-opacity duration-200 hover:opacity-95"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          decoding="async"
          className="h-auto max-h-[420px] w-full rounded-xl border border-line-2 object-cover"
        />
      </button>

      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          // Anywhere but the picture closes it, which is what a full-screen
          // image is expected to do — so the test is the dialog itself and the
          // image stops the click from reaching it.
          if (event.target !== dialog.current) return;
          setOpen(false);
        }}
        className="ease-brand fixed inset-0 m-0 flex h-full max-h-none w-full max-w-none flex-col bg-ground/98 p-0 text-ink backdrop:bg-black/80"
      >
        <div className="flex justify-end p-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={C.decisionDismiss}
            className="ease-brand flex size-tap items-center justify-center rounded-lg text-ink-2 transition-colors duration-200 hover:text-ink"
          >
            <CloseIcon />
          </button>
        </div>

        {/* min-h-0 on a flex child, or the image refuses to shrink below its
            natural height and pushes the counts off the bottom. */}
        <div className="flex min-h-0 flex-1 items-center justify-center px-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            onClick={(event) => event.stopPropagation()}
            className="max-h-full max-w-full object-contain"
          />
        </div>

        <div className="border-t border-line px-6 py-4">{footer}</div>
      </dialog>
    </>
  );
}
