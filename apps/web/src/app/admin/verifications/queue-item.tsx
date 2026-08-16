"use client";

import { useActionState } from "react";

import { decideVerification, revealCondition } from "./actions";
import { DECISION_INITIAL, REVEAL_INITIAL } from "./state";

export interface FlaggedMember {
  user_id: string;
  display_name: string | null;
  verification_status: string;
  appeal_opened_at: string | null;
  flagged_at: string | null;
}

/**
 * One member awaiting review.
 *
 * Condition data is absent from the queue query entirely, not hidden with CSS —
 * it is not in the payload, so it cannot be read out of the page source. The
 * reveal below fetches it on demand, and only with a reason that gets written
 * down.
 */
export function QueueItem({ member }: { member: FlaggedMember }) {
  const [decision, decide, deciding] = useActionState(decideVerification, DECISION_INITIAL);
  const [reveal, doReveal, revealing] = useActionState(revealCondition, REVEAL_INITIAL);

  return (
    <li className="rounded-lg border border-line-2 bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[1.3rem]">{member.display_name ?? "No name yet"}</h2>
        <span className="text-[13px] tracking-[0.04em] text-ink-3 uppercase">
          {member.verification_status}
        </span>
      </div>

      {member.appeal_opened_at ? (
        <p className="mt-3 text-[14.5px] text-caution">
          Appealed {new Date(member.appeal_opened_at).toLocaleDateString()}
        </p>
      ) : null}

      <form action={decide} className="mt-6 flex flex-col gap-3">
        <input type="hidden" name="user_id" value={member.user_id} />
        <label htmlFor={`note-${member.user_id}`} className="text-[14px] text-ink-2">
          Note (recorded in the audit log)
        </label>
        <input
          id={`note-${member.user_id}`}
          name="note"
          type="text"
          className="rounded-lg border border-line-2 bg-ground px-3.5 py-2.5 text-[15px] focus:border-accent focus:outline-none"
        />
        <div className="mt-1 flex gap-3">
          <button
            type="submit"
            name="decision"
            value="approve"
            disabled={deciding}
            className="ease-brand rounded-lg bg-accent px-5 py-2.5 text-[15px] text-accent-ink transition-opacity duration-200 hover:opacity-90 disabled:opacity-55"
          >
            Verify
          </button>
          <button
            type="submit"
            name="decision"
            value="reject"
            disabled={deciding}
            className="ease-brand rounded-lg border border-line-2 px-5 py-2.5 text-[15px] transition-colors duration-200 hover:border-critical hover:text-critical disabled:opacity-55"
          >
            Reject
          </button>
        </div>
        {decision.error ? (
          <p role="alert" className="text-[14px] text-critical">
            {decision.error}
          </p>
        ) : null}
        {decision.message ? (
          <p role="status" className="text-[14px] text-positive">
            {decision.message}
          </p>
        ) : null}
      </form>

      <details className="mt-6 border-t border-line pt-5">
        <summary className="cursor-pointer text-[14.5px] text-ink-2">Reveal condition data</summary>
        <p className="mt-3 text-[13.5px] text-ink-3">
          Deciding whether a selfie matches a face does not need this. Every reveal is logged
          against your account with the reason you give.
        </p>
        <form action={doReveal} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="user_id" value={member.user_id} />
          <input
            name="reason"
            type="text"
            required
            minLength={10}
            placeholder="Why you need it"
            aria-label="Why you need it"
            className="rounded-lg border border-line-2 bg-ground px-3.5 py-2.5 text-[15px] focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={revealing}
            className="ease-brand self-start rounded-lg border border-line-2 px-5 py-2.5 text-[15px] transition-colors duration-200 hover:border-accent disabled:opacity-55"
          >
            Reveal and log
          </button>
          {reveal.error ? (
            <p role="alert" className="text-[14px] text-critical">
              {reveal.error}
            </p>
          ) : null}
          {reveal.revealed ? (
            <p className="text-[15px]">
              {reveal.revealed.community} · {reveal.revealed.condition}
              {reveal.revealed.u_equals_u ? " · U=U" : ""}
            </p>
          ) : null}
        </form>
      </details>
    </li>
  );
}
