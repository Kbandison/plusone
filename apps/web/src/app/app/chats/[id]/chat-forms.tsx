"use client";

import { useActionState, useId, useState } from "react";

import { CLOSURE_TEMPLATES, CONNECTS, DRAFT_COPY, renderClosureTemplate } from "@plusone/config";

import { cancelPlan, closeChat, confirmPlan, proposePlan, sendMessage } from "./actions";
import { CHAT_INITIAL } from "./state";
import { buttonClass } from "@/app/ui";

const C = DRAFT_COPY.app;

function Error({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-[12.6px] text-critical">
      {message}
    </p>
  );
}

export function Composer({ chatId }: { chatId: string }) {
  const [state, act, pending] = useActionState(sendMessage, CHAT_INITIAL);
  return (
    <form action={act} className="mt-6 flex flex-col gap-3">
      <input type="hidden" name="chat_id" value={chatId} />
      <div className="flex gap-3">
        <input
          name="body"
          type="text"
          // Pressing Send on an empty field did nothing at all: the action
          // early-returned {error: null}, so there was no error, no message and
          // no change. Sighted members saw nothing happen; everyone else heard
          // nothing happen.
          required
          maxLength={4000}
          placeholder={C.messagePlaceholder}
          // A placeholder is not a label: it is gone the moment a character is
          // typed, so a member who tabs back lands on an unnamed field. This is
          // the primary messaging control of the product.
          aria-label={C.messagePlaceholder}
          /* min-w-0: a flex item's default min-width is `auto`, which for a text
             input resolves to its intrinsic control width (~234px). At 320px
             that pushed Send off the right edge with nothing to scroll to, so
             the composer could not be used at all on a small phone.
             is gone too — globals.css defines the keyboard
             focus ring the accessibility gate requires, and this cancelled it. */
          className="min-w-0 flex-1 rounded-lg border border-line-control bg-surface px-4 py-3 text-[16px] focus:border-accent"
        />
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {C.sendLabel}
        </button>
      </div>
      <Error message={state.error} />
    </form>
  );
}

/**
 * The date plan (§6.2).
 *
 * Three fields, all required — a plan is concrete or it is not a plan. Vague
 * agreement to "do something sometime" is exactly what the fuse exists to stop
 * counting as progress.
 */
export function ProposePlan({ chatId }: { chatId: string }) {
  const [state, act, pending] = useActionState(proposePlan, CHAT_INITIAL);
  return (
    <form
      action={act}
      className="mt-8 flex flex-col gap-4 rounded-xl border border-line-2 bg-surface p-6"
    >
      <h2 className="text-[1.034rem]">{C.proposeHeading}</h2>
      <input type="hidden" name="chat_id" value={chatId} />

      {[
        { name: "date", label: C.planDateLabel, type: "date" },
        { name: "time", label: C.planTimeLabel, type: "text" },
        { name: "place", label: C.planPlaceLabel, type: "text" },
      ].map((field) => (
        <label key={field.name} className="flex flex-col gap-2 text-[12.6px] text-ink-2">
          {field.label}
          <input
            name={field.name}
            type={field.type}
            required
            className="rounded-lg border border-line-2 bg-ground px-3.5 py-2.5 text-[16px] focus:border-accent"
          />
        </label>
      ))}

      <Error message={state.error} />

      <button type="submit" disabled={pending} className={buttonClass("primary", "self-start")}>
        {C.proposeLabel}
      </button>
    </form>
  );
}

export function ConfirmPlan({ chatId, canConfirm }: { chatId: string; canConfirm: boolean }) {
  const [confirmState, confirm, confirming] = useActionState(confirmPlan, CHAT_INITIAL);

  return (
    <div className="mt-8 flex flex-col gap-4 rounded-xl border border-line-2 bg-surface p-6">
      {canConfirm ? (
        <form action={confirm}>
          <input type="hidden" name="chat_id" value={chatId} />
          <button type="submit" disabled={confirming} className={buttonClass("primary")}>
            {C.confirmPlanLabel}
          </button>
        </form>
      ) : (
        // The fuse keeps running while a proposal sits unconfirmed. A plan one
        // person likes is not a plan.
        <p className="text-[13.6px] text-ink-2">{C.awaitingConfirmation}</p>
      )}

      <Error message={confirmState.error} />
    </div>
  );
}

/**
 * Cancelling a plan both people confirmed (§6.2).
 *
 * Split out of ConfirmPlan, which is the only reason it never worked. The
 * cancel control lived inside that component, and ConfirmPlan rendered only
 * when the chat was NOT date_planned — while cancel_date_plan refuses unless it
 * IS. Exact complements: the control was mounted precisely where the RPC always
 * refused, and absent from the one state where it succeeds. §6.2 says a
 * cancelled plan returns the chat to the fuse; there was no way to reach it.
 */
export function CancelPlan({ chatId }: { chatId: string }) {
  const [cancelState, cancel, cancelling] = useActionState(cancelPlan, CHAT_INITIAL);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const confirmId = useId();

  return (
    <div className="mt-8 flex flex-col gap-4 rounded-xl border border-line-2 bg-surface p-6">
      {/* Asked first. This was a one-tap submit that discarded a plan both
          people had confirmed — the single most valuable thing in the chat —
          sitting a few pixels under the button that confirms it.

          Blocking is deliberately unguarded and this is deliberately not: a
          block is reversible from Settings and is reached at the worst moment
          someone will have here, where a cancelled plan means going back to the
          other person and asking again.

          The trigger stays MOUNTED while the confirmation is open. It used to be
          the other branch of a ternary, so activating it destroyed the element
          holding focus and dropped the cursor to <body> exactly when the member
          was being asked a question. aria-expanded says what is actually true
          rather than a hard-coded false. */}
      <button
        type="button"
        onClick={() => setConfirmingCancel((open) => !open)}
        aria-expanded={confirmingCancel}
        aria-controls={confirmId}
        className="ease-brand self-start text-[13px] text-ink-3 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
      >
        {C.cancelPlanLabel}
      </button>

      {confirmingCancel ? (
        <div id={confirmId} className="flex flex-col gap-3">
          <p role="status" className="text-[13px] text-ink-2">
            {C.cancelPlanConfirm}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <form action={cancel}>
              <input type="hidden" name="chat_id" value={chatId} />
              <button type="submit" disabled={cancelling} className={buttonClass("danger")}>
                {C.cancelPlanConfirmLabel}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setConfirmingCancel(false)}
              className="ease-brand text-[13px] text-ink-3 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
            >
              {C.cancelPlanKeepLabel}
            </button>
          </div>
        </div>
      ) : null}

      <Error message={cancelState.error} />
    </div>
  );
}

/**
 * Closing (§3.5).
 *
 * There is no way to leave without saying something: a template is always
 * selected, and one is checked by default. Nobody gets left on read.
 */
export function CloseChat({ chatId, senderName }: { chatId: string; senderName: string }) {
  const [state, act, pending] = useActionState(closeChat, CHAT_INITIAL);
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState(0);
  const [line, setLine] = useState("");

  // Mounted whether open or not — see the note on DeclineForm. Replacing the
  // trigger with the form threw away the focused element and announced nothing.
  const trigger = (
    <button
      type="button"
      onClick={() => setOpen((current) => !current)}
      aria-expanded={open}
      className="ease-brand mt-10 self-start text-[13px] text-ink-3 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
    >
      {C.closeHeading}
    </button>
  );

  if (!open) return trigger;

  return (
    <>
      {trigger}
      <form
        action={act}
        className="mt-6 flex flex-col gap-5 rounded-xl border border-line-2 bg-surface p-6"
      >
        <h2 className="text-[1.034rem]">{C.closeHeading}</h2>
        <input type="hidden" name="chat_id" value={chatId} />

        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2 text-[12.6px] text-ink-2">{C.closeTemplateLabel}</legend>
          {CLOSURE_TEMPLATES.map((text, index) => (
            <label
              key={text}
              className="ease-brand flex cursor-pointer items-start gap-3 rounded-lg border border-line-2 bg-ground px-3.5 py-3 text-[13px] transition-colors duration-200 has-checked:border-accent"
            >
              <input
                type="radio"
                name="template"
                value={index}
                checked={template === index}
                onChange={() => setTemplate(index)}
                className="mt-1 size-[14.4px] shrink-0 accent-accent"
              />
              {text}
            </label>
          ))}
        </fieldset>

        <label className="flex flex-col gap-2 text-[12.6px] text-ink-2">
          {C.closePersonalLineLabel}
          <input
            name="personal_line"
            type="text"
            maxLength={CONNECTS.personalLineMaxChars}
            value={line}
            onChange={(event) => setLine(event.target.value)}
            className="rounded-lg border border-line-2 bg-ground px-3.5 py-2.5 text-[13.6px] focus:border-accent"
          />
        </label>

        {/* Exactly what they will receive, before it is sent. Template one
          carries the sender's name, so the preview substitutes it rather than
          showing a member a raw {name} placeholder. */}
        <p className="rounded-lg bg-surface-2 px-4 py-3.5 text-[13px] leading-[1.6] text-ink-2">
          {renderClosureTemplate(template, senderName)}
          {line ? ` ${line}` : ""}
        </p>

        <Error message={state.error} />

        <button type="submit" disabled={pending} className={buttonClass("primary", "self-start")}>
          {C.closeLabel}
        </button>
      </form>
    </>
  );
}
