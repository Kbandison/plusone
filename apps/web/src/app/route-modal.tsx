"use client";

import { useEffect, useRef } from "react";

import { useRouter } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";

import { CloseIcon } from "./modal";

const C = DRAFT_COPY.app;

/**
 * A modal that IS a route.
 *
 * The sibling of Modal, and deliberately not the same component: Modal opens
 * from a trigger it renders itself, and this one is already open by the time it
 * exists — an intercepted route put it there. Closing means going back, not
 * setting a flag.
 *
 * What this buys over a modal holding fetched state: the URL is real. A member
 * who shares it, refreshes on it, or arrives from outside gets the full page,
 * because the interception only happens on a soft navigation from inside the
 * room. Back closes it and forward reopens it, without any of that being
 * something we wrote.
 */
export function RouteModal({ children }: { children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  // showModal() rather than the open attribute, and in an effect because it is
  // a DOM call: the attribute alone gives a dialog with no focus trap, no
  // Escape, no inertness behind it and no ::backdrop — which is to say none of
  // the reasons to use a dialog.
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      // Escape fires close, and close is the only place that navigates — so
      // the keyboard, the backdrop and the button all leave the same way.
      onClose={() => router.back()}
      onClick={(event) => {
        // A backdrop click targets the DIALOG element itself, never anything
        // inside it — the ::backdrop is not a node that can be a target — so
        // comparing the target to the dialog is the whole test. It has to be
        // the dialog rather than !contains(target), because a click landing on
        // padding inside the dialog would otherwise close it.
        if (event.target === dialog.current) dialog.current?.close();
      }}
      /* A sheet, flush to the bottom of the screen on a phone.
         Held off the nav it read as a panel floating in the middle of nothing,
         which is what a gap under a bottom sheet always looks like. So it goes
         all the way down and covers the nav — which is fine, and is what every
         bottom sheet does: showModal() has already made everything behind it
         inert, so the nav under there was not usable anyway.

         pb-10 rather than pb-6: the last line of a sheet that reaches the
         bottom edge needs room for a thumb and for a phone's home indicator.

         On anything wider it centres, where a sheet is not the idiom. */
      className="ease-brand m-0 mt-auto mb-0 max-h-[88vh] w-full max-w-[550.8px] overflow-y-auto rounded-t-2xl border border-line-2 bg-ground px-6 pt-4 pb-10 text-ink backdrop:bg-black/45 sm:m-auto sm:max-h-[84vh] sm:rounded-2xl sm:pb-8"
    >
      <div className="mb-1 flex justify-end">
        {/* method="dialog" closes without any JavaScript of ours, and onClose
            above turns that into the navigation. */}
        <form method="dialog" className="-mr-2.5">
          <button
            type="submit"
            aria-label={C.decisionDismiss}
            className="ease-brand flex size-tap items-center justify-center rounded-lg text-ink-3 transition-colors duration-200 hover:text-ink"
          >
            <CloseIcon />
          </button>
        </form>
      </div>

      {children}
    </dialog>
  );
}
