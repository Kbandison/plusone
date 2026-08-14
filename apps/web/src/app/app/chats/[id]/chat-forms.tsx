"use client";

import { useActionState, useState } from "react";

import { CLOSURE_TEMPLATES, CONNECTS, DRAFT_COPY, renderClosureTemplate } from "@plusone/config";

import { CHAT_INITIAL, cancelPlan, closeChat, confirmPlan, proposePlan, sendMessage } from "./actions";

const C = DRAFT_COPY.app;

function Error({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-[14px] text-critical">
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
          maxLength={4000}
          placeholder={C.messagePlaceholder}
          className="flex-1 rounded-lg border border-line-2 bg-surface px-4 py-3 text-[16px] focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="ease-brand rounded-lg bg-accent px-5 py-3 text-[15px] text-accent-ink transition-opacity duration-200 hover:opacity-90 disabled:opacity-55"
        >
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
    <form action={act} className="mt-8 flex flex-col gap-4 rounded-xl border border-line-2 bg-surface p-6">
      <h2 className="text-[1.15rem]">{C.proposeHeading}</h2>
      <input type="hidden" name="chat_id" value={chatId} />

      {[
        { name: "date", label: C.planDateLabel, type: "date" },
        { name: "time", label: C.planTimeLabel, type: "text" },
        { name: "place", label: C.planPlaceLabel, type: "text" },
      ].map((field) => (
        <label key={field.name} className="flex flex-col gap-2 text-[14px] text-ink-2">
          {field.label}
          <input
            name={field.name}
            type={field.type}
            required
            className="rounded-lg border border-line-2 bg-ground px-3.5 py-2.5 text-[15px] focus:border-accent focus:outline-none"
          />
        </label>
      ))}

      <Error message={state.error} />

      <button
        type="submit"
        disabled={pending}
        className="ease-brand self-start rounded-lg bg-accent px-5 py-2.5 text-[15px] text-accent-ink transition-opacity duration-200 hover:opacity-90 disabled:opacity-55"
      >
        {C.proposeLabel}
      </button>
    </form>
  );
}

export function ConfirmPlan({ chatId, canConfirm }: { chatId: string; canConfirm: boolean }) {
  const [confirmState, confirm, confirming] = useActionState(confirmPlan, CHAT_INITIAL);
  const [cancelState, cancel, cancelling] = useActionState(cancelPlan, CHAT_INITIAL);

  return (
    <div className="mt-8 flex flex-col gap-4 rounded-xl border border-line-2 bg-surface p-6">
      {canConfirm ? (
        <form action={confirm}>
          <input type="hidden" name="chat_id" value={chatId} />
          <button
            type="submit"
            disabled={confirming}
            className="ease-brand rounded-lg bg-accent px-5 py-2.5 text-[15px] text-accent-ink transition-opacity duration-200 hover:opacity-90 disabled:opacity-55"
          >
            {C.confirmPlanLabel}
          </button>
        </form>
      ) : (
        // The fuse keeps running while a proposal sits unconfirmed. A plan one
        // person likes is not a plan.
        <p className="text-[15px] text-ink-2">{C.awaitingConfirmation}</p>
      )}

      <form action={cancel}>
        <input type="hidden" name="chat_id" value={chatId} />
        <button
          type="submit"
          disabled={cancelling}
          className="ease-brand text-[14.5px] text-ink-3 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink disabled:opacity-55"
        >
          {C.cancelPlanLabel}
        </button>
      </form>

      <Error message={confirmState.error ?? cancelState.error} />
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

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ease-brand mt-10 self-start text-[14.5px] text-ink-3 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
      >
        {C.closeHeading}
      </button>
    );
  }

  return (
    <form action={act} className="mt-10 flex flex-col gap-5 rounded-xl border border-line-2 bg-surface p-6">
      <h2 className="text-[1.15rem]">{C.closeHeading}</h2>
      <input type="hidden" name="chat_id" value={chatId} />

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2 text-[14px] text-ink-2">{C.closeTemplateLabel}</legend>
        {CLOSURE_TEMPLATES.map((text, index) => (
          <label
            key={text}
            className="ease-brand flex cursor-pointer items-start gap-3 rounded-lg border border-line-2 bg-ground px-3.5 py-3 text-[14.5px] transition-colors duration-200 has-checked:border-accent"
          >
            <input
              type="radio"
              name="template"
              value={index}
              checked={template === index}
              onChange={() => setTemplate(index)}
              className="mt-1 size-[16px] shrink-0 accent-accent"
            />
            {text}
          </label>
        ))}
      </fieldset>

      <label className="flex flex-col gap-2 text-[14px] text-ink-2">
        {C.closePersonalLineLabel}
        <input
          name="personal_line"
          type="text"
          maxLength={CONNECTS.personalLineMaxChars}
          value={line}
          onChange={(event) => setLine(event.target.value)}
          className="rounded-lg border border-line-2 bg-ground px-3.5 py-2.5 text-[15px] focus:border-accent focus:outline-none"
        />
      </label>

      {/* Exactly what they will receive, before it is sent. Template one
          carries the sender's name, so the preview substitutes it rather than
          showing a member a raw {name} placeholder. */}
      <p className="rounded-lg bg-surface-2 px-4 py-3.5 text-[14.5px] leading-[1.6] text-ink-2">
        {renderClosureTemplate(template, senderName)}
        {line ? ` ${line}` : ""}
      </p>

      <Error message={state.error} />

      <button
        type="submit"
        disabled={pending}
        className="ease-brand self-start rounded-lg bg-accent px-5 py-2.5 text-[15px] text-accent-ink transition-opacity duration-200 hover:opacity-90 disabled:opacity-55"
      >
        {C.closeLabel}
      </button>
    </form>
  );
}
