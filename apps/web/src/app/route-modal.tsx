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
      /* mb clears the bottom nav and nothing more.
         A dialog is in the top layer, so it renders above a fixed nav however
         high that nav's z-index is; the only way not to cover it is not to be
         over it. The nav is one row — a 44px link, 12px of padding, a border —
         so this is that plus a little air, rather than the 144px it was, which
         left a band of backdrop under the panel wide enough to look like a
         mistake. */
      className="ease-brand m-0 mt-auto mb-20 max-h-[82vh] w-full max-w-[550.8px] overflow-y-auto rounded-t-2xl border border-line-2 bg-ground px-6 pt-4 pb-6 text-ink backdrop:bg-black/45 sm:m-auto sm:mb-20 sm:max-h-[84vh] sm:rounded-2xl"
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
