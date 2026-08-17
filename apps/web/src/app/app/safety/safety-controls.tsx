"use client";

import { useActionState, useState } from "react";

import {
  DRAFT_COPY,
  REPORT_DETAIL_MAX_CHARS,
  REPORT_REASONS,
  type ReportReason,
} from "@plusone/config";

import { blockMember, reportMember, unblockMember } from "@/lib/safety";
import { SAFETY_INITIAL } from "@/lib/safety-state";

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
      <span role="status" className="text-[14px] text-ink-3">
        {state.message}
      </span>
    );
  }

  return (
    <form action={act} className="inline">
      {memberId ? <input type="hidden" name="blocked_id" value={memberId} /> : null}
      {roomMessageId ? <input type="hidden" name="room_message_id" value={roomMessageId} /> : null}
      <button
        type="submit"
        disabled={pending}
        // Every one of these is named "Block". Pointing at the text it acts on
        // is what tells a screen reader user which post they are blocking —
        // and it uses the post itself rather than a label invented for it.
        aria-describedby={describedBy}
        className="ease-brand text-[14px] text-ink-3 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-critical disabled:opacity-55"
      >
        {C.blockLabel}
      </button>
    </form>
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
  describedBy,
  headingLevel = 3,
}: {
  memberId?: string;
  messageId?: string;
  roomMessageId?: string;
  /** Id of the text this control acts on, so repeated buttons are told apart. */
  describedBy?: string;
  /**
   * Where this sits in the page's outline.
   *
   * A chat page supplies an h2 above this — the plan panel, the closure note —
   * so h3 is correct there. A room page's only h2 is the pinned-resource aside,
   * which renders solely when a room HAS one, so on most rooms this h3 followed
   * the h1 with nothing between and the outline skipped a level.
   */
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const [state, act, pending] = useActionState(reportMember, SAFETY_INITIAL);
  const [open, setOpen] = useState(false);

  if (state.message) {
    return (
      <p role="status" className="text-[14px] text-positive">
        {state.message}
      </p>
    );
  }

  // Mounted whether open or not. Replacing it with the form unmounted the
  // focused button and left the revealed heading unannounced — on a control
  // someone reaches when something has already gone wrong.
  const trigger = (
    <button
      type="button"
      onClick={() => setOpen((current) => !current)}
      aria-describedby={describedBy}
      aria-expanded={open}
      className="ease-brand text-[14px] text-ink-3 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
    >
      {C.reportLabel}
    </button>
  );

  if (!open) return trigger;

  return (
    <>
      {trigger}
      <form
        action={act}
        className="mt-4 flex flex-col gap-4 rounded-lg border border-line-2 bg-surface p-5"
      >
        <Heading className="text-[1.05rem]">{C.reportHeading}</Heading>
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
              <input
                type="radio"
                name="reason"
                value={reason}
                required
                className="size-[16px] accent-accent"
              />
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
            className="rounded-lg border border-line-2 bg-ground px-3.5 py-2.5 text-[15px] focus:border-accent"
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
    </>
  );
}
