"use client";

import { useRef } from "react";

import { DRAFT_COPY } from "@plusone/config";

import type { MemberPhoto } from "@/lib/photo-urls";
import { MemberPhotoFrame } from "../member-photo";
import { AcceptForm, DeclineForm } from "./inbox-forms";

const C = DRAFT_COPY.app;

export interface Decision {
  readonly id: string;
  readonly name: string;
  readonly question: string | null;
  readonly reply: string;
  readonly photo: MemberPhoto | undefined;
}

/**
 * A face in the queue, and the decision behind it.
 *
 * A native <dialog>, not a hand-rolled overlay. `showModal()` brings focus
 * trapping, Escape, inertness of everything behind it and a ::backdrop with no
 * JavaScript of ours — every one of which is a thing hand-rolled modals get
 * wrong, and three of which are invisible until somebody using a keyboard or a
 * screen reader meets them.
 *
 * The decision lives in a dialog rather than on the row because accepting
 * cannot be undone, and a row in a horizontal scroller is the wrong place for
 * an irreversible choice made with a thumb. Decision #14 also makes the reply
 * the whole of a connect — no name, no photo, you decide on what somebody said
 * — so it needs room to be read rather than a line to be glanced at.
 */
export function DecisionBubble({ decision }: { decision: Decision }) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="ease-brand flex w-[93.3px] flex-col items-center gap-2 transition-opacity duration-200 hover:opacity-80"
      >
        <span className="relative inline-flex">
          <MemberPhotoFrame photo={decision.photo} size={76} />
          <span aria-hidden="true" className="absolute inset-0 rounded-full ring-2 ring-accent" />
        </span>
        <span className="w-full truncate text-center text-[15.6px] text-ink-2">
          {decision.name}
        </span>
      </button>

      <dialog
        ref={dialog}
        aria-label={C.threadNeedsDecision}
        // Positioned by us rather than by the default centring, so it sits as a
        // sheet on a phone and a panel on anything wider. backdrop:bg is the
        // ::backdrop pseudo-element, which only exists for a modal dialog.
        className="ease-brand m-0 mt-auto w-full max-w-[577.8px] rounded-t-2xl border border-line-2 bg-surface p-6 text-ink backdrop:bg-black/45 sm:m-auto sm:rounded-2xl"
      >
        <div className="flex items-center gap-4">
          <MemberPhotoFrame photo={decision.photo} size={64} />
          <h2 className="text-h3">{decision.name}</h2>
        </div>

        {/* The question above the reply. Without it a reply is half a sentence
            — "three, so you would be busy" decides nothing. */}
        <figure className="mt-6 rounded-xl border border-line-2 bg-ground p-5">
          {decision.question ? (
            <figcaption className="text-[14.4px] tracking-[0.02em] text-ink-3 uppercase">
              {decision.question}
            </figcaption>
          ) : null}
          <blockquote id={`reply-${decision.id}`} className="mt-2 text-[18.9px] leading-[1.6]">
            {decision.reply}
          </blockquote>
        </figure>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <AcceptForm connectId={decision.id} describedBy={`reply-${decision.id}`} />
          <DeclineForm connectId={decision.id} describedBy={`reply-${decision.id}`} />
        </div>

        {/* Decision #14 — no interaction ends in silence, so a decline still
            sends a note. Said before the button is pressed, so Decline never
            reads as "ignore". */}
        <p className="mt-4 text-[15px] leading-[1.6] text-ink-3">{C.declineNote}</p>

        {/* A way out that is not a decision. Escape does this too, but only for
            somebody who knows it does. */}
        <form method="dialog" className="mt-5">
          <button
            type="submit"
            className="ease-brand min-h-tap text-[15.6px] text-ink-3 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
          >
            {C.decisionDismiss}
          </button>
        </form>
      </dialog>
    </>
  );
}
