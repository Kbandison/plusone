"use client";

import { useRef } from "react";

import { DRAFT_COPY } from "@plusone/config";

const C = DRAFT_COPY.app;

/**
 * The one modal.
 *
 * A native <dialog> opened with showModal(), not a hand-rolled overlay:
 * focus trapping, Escape, inertness of everything behind it and a ::backdrop
 * all arrive without JavaScript of ours. Every one of those is a thing
 * hand-rolled overlays get wrong, and three of them are invisible until
 * somebody using a keyboard or a screen reader meets them.
 *
 * Shared, because this is the second time the same forty lines were about to be
 * written — the argument ui.tsx makes about thirteen spellings of the primary
 * button, before it was thirteen. The backdrop-click rule below is exactly the
 * kind of detail that gets fixed in one copy and not the other.
 */
export function Modal({
  label,
  heading,
  trigger,
  triggerClassName,
  /**
   * Text on the page that tells repeated triggers apart — the room post this
   * one acts on, where twenty of them all read "Report".
   *
   * On the trigger and never inside the panel: showModal() makes the rest of
   * the page inert, and inert content leaves the accessibility tree, so an
   * aria-describedby inside the dialog pointing at the post behind it resolves
   * to nothing at the moment it is needed.
   */
  triggerDescribedBy,
  panelClassName = "",
  children,
}: {
  /** The accessible name, where no visible heading carries it. */
  label?: string;
  /** Shown as the panel's h2, and used as its accessible name. */
  heading?: string;
  trigger: React.ReactNode;
  triggerClassName?: string;
  triggerDescribedBy?: string | undefined;
  panelClassName?: string;
  /** Given a way to dismiss itself, for the form that has just succeeded. */
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-describedby={triggerDescribedBy}
        aria-haspopup="dialog"
        className={triggerClassName}
      >
        {trigger}
      </button>

      <dialog
        ref={dialog}
        aria-label={heading ? undefined : label}
        /**
         * Clicking outside closes it.
         *
         * A backdrop click targets the DIALOG element itself, never anything
         * inside it — the ::backdrop is not a node that can be a target — so
         * comparing the target to the dialog is the whole test. It has to be
         * the dialog rather than `!contains(target)`, because a click landing
         * on padding inside the dialog would otherwise close it.
         */
        onClick={(event) => {
          if (event.target === dialog.current) close();
        }}
        // Positioned by us rather than by the default centring, so it sits as a
        // sheet on a phone and a panel on anything wider. backdrop:bg is the
        // ::backdrop pseudo-element, which only exists for a modal dialog.
        className={`ease-brand m-0 mt-auto max-h-[86vh] w-full max-w-[520px] overflow-y-auto rounded-t-2xl border border-line-2 bg-surface p-6 text-ink backdrop:bg-black/45 sm:m-auto sm:rounded-2xl ${panelClassName}`}
      >
        <div className="flex items-start justify-between gap-4">
          {heading ? <h2 className="text-h3">{heading}</h2> : <span />}

          {/* method="dialog" closes without any JavaScript of ours, and keeps
              working if the click-outside handler never runs. */}
          <form method="dialog" className="-mt-1 -mr-1">
            <button
              type="submit"
              aria-label={C.decisionDismiss}
              className="ease-brand flex size-tap items-center justify-center rounded-lg text-ink-3 transition-colors duration-200 hover:text-ink"
            >
              <CloseIcon />
            </button>
          </form>
        </div>

        {typeof children === "function" ? children(close) : children}
      </dialog>
    </>
  );
}

/** Drawn rather than imported: one icon does not justify a dependency. */
export function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
      className="size-[18px] shrink-0"
    >
      <path
        d="M6 6l12 12M18 6L6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
