"use client";

import { useActionState } from "react";

import {
  DRAFT_COPY,
  REPORT_DETAIL_MAX_CHARS,
  REPORT_REASONS,
  type ReportReason,
} from "@plusone/config";

import { blockMember, reportMember, unblockMember } from "@/lib/safety";
import { SAFETY_INITIAL } from "@/lib/safety-state";
import { buttonClass } from "@/app/ui";
import { Modal } from "@/app/modal";

const C = DRAFT_COPY.app;

/**
 * Blocking.
 *
 * Immediate and mutual, and it asks nothing. A member reaching for this is
 * often having the worst moment this product will give them; a dialogue asking
 * them to justify it is the wrong thing to put in the way. Reversible from
 * Settings, which is where the explaining belongs.
 */
export function BlockButton({
  memberId,
  roomMessageId,
  describedBy,
}: {
  memberId?: string;
  /** Blocking a room post's author without the page ever holding their id. */
  roomMessageId?: string;
  /** Id of the text this button acts on, so repeated buttons are told apart. */
  describedBy?: string;
}) {
  const [state, act, pending] = useActionState(blockMember, SAFETY_INITIAL);

  if (state.message) {
    // role="status" because the form that held the focused button is being
    // unmounted underneath it. Without this a member presses Block, hears
    // nothing at all, finds their focus back at the top of the page, and
    // reasonably presses it again — at the moment in this product when someone
    // is least able to absorb an ambiguous result.
    return (
      <span role="status" className="text-[11.3px] text-ink-3">
        {state.message}
      </span>
    );
  }

  return (
    <Modal
      heading={C.blockLabel}
      trigger={C.blockLabel}
      // On the trigger, not the confirm button: the post it names sits behind
      // an open modal, and inert content is out of the accessibility tree.
      triggerDescribedBy={describedBy}
      triggerClassName="ease-brand text-left text-[11.3px] text-ink-3 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-critical"
    >
      {/* blockConfirm was written, then knowingly left unwired for a reason
          recorded in copy-is-wired.test.ts: a member reaching for this is
          having the worst moment the product will give them, and should not be
          asked to justify it. Nothing here asks why. What changed is that block
          now sits one row from Report in a menu and cannot be undone from the
          chat — so the mis-tap this prevents costs a connection, and the
          confirmation costs a press. */}
      <p className="mt-4 text-[12.6px] leading-[1.65] text-ink-2">{C.blockConfirm}</p>

      <form action={act} className="mt-6 flex flex-wrap items-center gap-3">
        {memberId ? <input type="hidden" name="blocked_id" value={memberId} /> : null}
        {roomMessageId ? (
          <input type="hidden" name="room_message_id" value={roomMessageId} />
        ) : null}
        <button type="submit" disabled={pending} className={buttonClass("danger")}>
          {C.blockConfirmLabel}
        </button>
      </form>

      {/* Leaving is a press of its own, not only the X in the corner. */}
      <form method="dialog" className="mt-3">
        <button type="submit" className={buttonClass("quiet")}>
          {C.blockKeepLabel}
        </button>
      </form>
    </Modal>
  );
}

export function UnblockButton({
  memberId,
  describedBy,
}: {
  memberId: string;
  /** Id of the row this button acts on — every one of these is named "Unblock". */
  describedBy?: string;
}) {
  const [, act, pending] = useActionState(unblockMember, SAFETY_INITIAL);
  return (
    <form action={act} className="inline">
      <input type="hidden" name="blocked_id" value={memberId} />
      <button
        type="submit"
        disabled={pending}
        aria-describedby={describedBy}
        className="ease-brand text-[11.3px] text-accent underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:decoration-accent disabled:opacity-55"
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
  describedBy,
}: {
  memberId?: string;
  messageId?: string;
  roomMessageId?: string;
  /** Id of the text this control acts on, so repeated buttons are told apart. */
  describedBy?: string;
}) {
  const [state, act, pending] = useActionState(reportMember, SAFETY_INITIAL);

  if (state.message) {
    return (
      <p role="status" className="text-[11.3px] text-positive">
        {state.message}
      </p>
    );
  }

  // In a modal rather than inline. It expanded in place under a disclosure,
  // which was tolerable when it sat at the bottom of a page with room beneath
  // it — inside a 232px header menu the reason list and the free-text field had
  // nowhere to go. showModal() also brings the focus trap this form always
  // wanted: it is eight controls someone reaches when something has already
  // gone wrong, and tabbing out of it into the conversation helps nobody.
  return (
    <Modal
      heading={C.reportHeading}
      trigger={C.reportLabel}
      triggerDescribedBy={describedBy}
      triggerClassName="ease-brand text-left text-[11.3px] text-ink-3 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
    >
      <form action={act} className="mt-4 flex flex-col gap-4">
        <p className="text-[11.3px] leading-[1.6] text-ink-2">{C.reportIntro}</p>

        {memberId ? <input type="hidden" name="reported_user_id" value={memberId} /> : null}
        {messageId ? <input type="hidden" name="reported_message_id" value={messageId} /> : null}
        {roomMessageId ? (
          <input type="hidden" name="reported_room_message_id" value={roomMessageId} />
        ) : null}

        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2 text-[11.3px] text-ink-2">{C.reportReasonLabel}</legend>
          {(Object.keys(REPORT_REASONS) as ReportReason[]).map((reason) => (
            <label
              key={reason}
              className="ease-brand flex cursor-pointer items-center min-h-tap gap-3 rounded-lg border border-line-2 bg-ground px-3.5 py-2.5 text-[11.7px] transition-colors duration-200 has-checked:border-accent"
            >
              <input
                type="radio"
                name="reason"
                value={reason}
                required
                className="size-[14.6px] accent-accent"
              />
              {REPORT_REASONS[reason]}
            </label>
          ))}
        </fieldset>

        <label className="flex flex-col gap-2 text-[11.3px] text-ink-2">
          {C.reportDetailLabel}
          <textarea
            name="detail"
            rows={3}
            maxLength={REPORT_DETAIL_MAX_CHARS}
            className="rounded-lg border border-line-2 bg-ground px-3.5 py-2.5 text-[16px] focus:border-accent"
          />
        </label>

        {memberId ? (
          <label className="flex items-center gap-3 text-[11.7px]">
            <input type="checkbox" name="also_block" className="size-[14.6px] accent-accent" />
            {C.reportAlsoBlock}
          </label>
        ) : null}

        {state.error ? (
          <p role="alert" className="text-[11.3px] text-critical">
            {state.error}
          </p>
        ) : null}

        <button type="submit" disabled={pending} className={buttonClass("primary", "self-start")}>
          {C.reportSubmitLabel}
        </button>
      </form>
    </Modal>
  );
}
