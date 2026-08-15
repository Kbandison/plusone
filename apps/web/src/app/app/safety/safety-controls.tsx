"use client";

import { useActionState, useState } from "react";

import { DRAFT_COPY, REPORT_DETAIL_MAX_CHARS, REPORT_REASONS, type ReportReason } from "@plusone/config";

import { SAFETY_INITIAL, blockMember, reportMember, unblockMember } from "@/lib/safety";

const C = DRAFT_COPY.app;

/**
 * Blocking.
 *
 * Immediate and mutual, and it asks nothing. A member reaching for this is
 * often having the worst moment this product will give them; a dialogue asking
 * them to justify it is the wrong thing to put in the way. Reversible from
 * Settings, which is where the explaining belongs.
 */
export function BlockButton({ memberId }: { memberId: string }) {
  const [state, act, pending] = useActionState(blockMember, SAFETY_INITIAL);

  if (state.message) {
    return <span className="text-[14px] text-ink-3">{state.message}</span>;
  }

  return (
    <form action={act} className="inline">
      <input type="hidden" name="blocked_id" value={memberId} />
      <button
        type="submit"
        disabled={pending}
        className="ease-brand text-[14px] text-ink-3 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-critical disabled:opacity-55"
      >
        {C.blockLabel}
      </button>
    </form>
  );
}

export function UnblockButton({ memberId }: { memberId: string }) {
  const [, act, pending] = useActionState(unblockMember, SAFETY_INITIAL);
  return (
    <form action={act} className="inline">
      <input type="hidden" name="blocked_id" value={memberId} />
      <button
        type="submit"
        disabled={pending}
        className="ease-brand text-[14px] text-accent underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:decoration-accent disabled:opacity-55"
      >
        {C.unblockLabel}
      </button>
    </form>
  );
}

/**
 * Reporting.
 *
 * Blocking is offered alongside but stays a separate tick. They are different
 * asks — "I never want to see this person" and "somebody should look at this" —
 * and a member who wants a moderator to act should not have to lose their own
 * view of the evidence to ask for it.
 */
export function ReportControl({
  memberId,
  messageId,
  roomMessageId,
}: {
  memberId?: string;
  messageId?: string;
  roomMessageId?: string;
}) {
  const [state, act, pending] = useActionState(reportMember, SAFETY_INITIAL);
  const [open, setOpen] = useState(false);

  if (state.message) {
    return <p className="text-[14px] text-positive">{state.message}</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ease-brand text-[14px] text-ink-3 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
      >
        {C.reportLabel}
      </button>
    );
  }

  return (
    <form action={act} className="mt-4 flex flex-col gap-4 rounded-lg border border-line-2 bg-surface p-5">
      <h3 className="text-[1.05rem]">{C.reportHeading}</h3>
      <p className="text-[14px] leading-[1.6] text-ink-2">{C.reportIntro}</p>

      {memberId ? <input type="hidden" name="reported_user_id" value={memberId} /> : null}
      {messageId ? <input type="hidden" name="reported_message_id" value={messageId} /> : null}
      {roomMessageId ? (
        <input type="hidden" name="reported_room_message_id" value={roomMessageId} />
      ) : null}

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2 text-[14px] text-ink-2">{C.reportReasonLabel}</legend>
        {(Object.keys(REPORT_REASONS) as ReportReason[]).map((reason) => (
          <label
            key={reason}
            className="ease-brand flex cursor-pointer items-center gap-3 rounded-lg border border-line-2 bg-ground px-3.5 py-2.5 text-[14.5px] transition-colors duration-200 has-checked:border-accent"
          >
            <input type="radio" name="reason" value={reason} required className="size-[16px] accent-accent" />
            {REPORT_REASONS[reason]}
          </label>
        ))}
      </fieldset>

      <label className="flex flex-col gap-2 text-[14px] text-ink-2">
        {C.reportDetailLabel}
        <textarea
          name="detail"
          rows={3}
          maxLength={REPORT_DETAIL_MAX_CHARS}
          className="rounded-lg border border-line-2 bg-ground px-3.5 py-2.5 text-[15px] focus:border-accent focus:outline-none"
        />
      </label>

      {memberId ? (
        <label className="flex items-center gap-3 text-[14.5px]">
          <input type="checkbox" name="also_block" className="size-[18px] accent-accent" />
          {C.reportAlsoBlock}
        </label>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-[14px] text-critical">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="ease-brand self-start rounded-lg bg-accent px-5 py-2.5 text-[15px] text-accent-ink transition-opacity duration-200 hover:opacity-90 disabled:opacity-55"
      >
        {C.reportSubmitLabel}
      </button>
    </form>
  );
}
