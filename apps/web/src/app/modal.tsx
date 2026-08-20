"use client";

import { Fragment, useEffect, useRef, useState } from "react";

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

  /**
   * One source of truth, and it is React's.
   *
   * showModal() in the handler and setOpen() beside it was two: the DOM knew
   * whether the dialog was showing, the component knew separately, and the two
   * only agreed as long as nothing else re-rendered between them. An effect
   * driving the DOM from state cannot drift — whatever React last decided is
   * what the dialog does.
   */
  const [open, setOpen] = useState(false);

  /**
   * Bumped on every opening, and used as a key on the contents.
   *
   * Unmounting them on close cleared the state and did it DURING the fade, so a
   * dialog closed to an empty panel and then faded out — a flicker at the end
   * of every dismissal. Keying on the opening keeps them present the whole way
   * out and still gives the next opening a fresh component, which is what
   * "reopened showing the last photograph" needed.
   */
  const [opening, setOpening] = useState(0);
  const close = () => setOpen(false);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    // Guarded both ways: showModal() on an open dialog throws, and close() on a
    // closed one fires a second close event.
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpening((n) => n + 1);
          setOpen(true);
        }}
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
        /**
         * Fires for every way out — Escape, the backdrop, the X's
         * method="dialog" — so there is one place that knows it is shut.
         */
        // The browser closing it — Escape, or the X's method="dialog" — told
        // back to the state that drives it.
        onClose={() => setOpen(false)}
        // Positioned by us rather than by the default centring, so it sits as a
        // sheet on a phone and a panel on anything wider. backdrop:bg is the
        // ::backdrop pseudo-element, which only exists for a modal dialog.
        /* Pinned, not asked for.
         *
         * `m-0 mt-auto` relies on auto-margin resolution inside a UA dialog box
         * that already sets `inset: 0`, `margin: auto` and its own max-height —
         * and when those over-constrain each other the browser decides where
         * the box lands. RouteModal learned that the expensive way; this had
         * the same shape and had not been caught yet. */
        className={`ease-brand fixed inset-x-0 top-auto bottom-0 mx-auto max-h-[86vh] w-full max-w-[520px] overflow-y-auto rounded-t-2xl border border-line-2 bg-surface p-6 text-ink backdrop:bg-black/45 sm:inset-0 sm:m-auto sm:rounded-2xl ${panelClassName}`}
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

        {/* Keyed on the opening, not mounted on it.
            Left mounted forever, a form kept whatever was in it — the composer
            reopened showing the photograph just posted. Unmounted on close, it
            emptied the panel mid-fade. The key does both: a fresh component
            every time it opens, and one that survives the way out. */}
        {opening > 0 ? (
          <Fragment key={opening}>
            {typeof children === "function" ? children(close) : children}
          </Fragment>
        ) : null}
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
