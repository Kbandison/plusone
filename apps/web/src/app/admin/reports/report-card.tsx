"use client";

import { useActionState } from "react";

import { REPORT_REASONS, type ReportReason } from "@plusone/config";

import { REPORT_DECISION_INITIAL, decideReport } from "./actions";

export interface OpenReport {
  queue_id: string;
  kind: string;
  reported_user_id: string | null;
  reported_display_name: string | null;
  reason: ReportReason;
  detail: string | null;
  reported_body: string | null;
  created_at: string;
}

/**
 * One report.
 *
 * The reported text and the reporter's account, and nothing about the reported
 * member beyond their name. §7.3 — condition data is never shown by default,
 * and judging whether a message was abusive does not need it. It is reachable
 * from member lookup, with a reason that gets written down.
 */
export function ReportCard({ report }: { report: OpenReport }) {
  const [state, act, pending] = useActionState(decideReport, REPORT_DECISION_INITIAL);

  if (state.message) {
    return (
      <li className="rounded-lg border border-line px-6 py-5 text-[15px] text-ink-3">
        {state.message}
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-line-2 bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[1.15rem]">{REPORT_REASONS[report.reason]}</h2>
        <span className="text-[13px] text-ink-3">
          {new Date(report.created_at).toLocaleDateString()}
        </span>
      </div>

      {report.reported_display_name ? (
        <p className="mt-2 text-[14px] text-ink-3">About {report.reported_display_name}</p>
      ) : null}

      {report.reported_body ? (
        <blockquote className="mt-5 border-l-2 border-line-2 pl-4 text-[15.5px] leading-[1.65] text-ink-2">
          {report.reported_body}
        </blockquote>
      ) : null}

      {report.detail ? (
        <p className="mt-4 text-[15px] leading-[1.65]">{report.detail}</p>
      ) : null}

      <form action={act} className="mt-6 flex flex-col gap-3">
        <input type="hidden" name="queue_id" value={report.queue_id} />
        <label htmlFor={`note-${report.queue_id}`} className="text-[14px] text-ink-2">
          Note (recorded in the audit log)
        </label>
        <input
          id={`note-${report.queue_id}`}
          name="note"
          type="text"
          className="rounded-lg border border-line-2 bg-ground px-3.5 py-2.5 text-[15px] focus:border-accent focus:outline-none"
        />
        <div className="mt-1 flex gap-3">
          <button
            type="submit"
            name="status"
            value="resolved"
            disabled={pending}
            className="ease-brand rounded-lg bg-accent px-5 py-2.5 text-[15px] text-accent-ink transition-opacity duration-200 hover:opacity-90 disabled:opacity-55"
          >
            Resolve
          </button>
          <button
            type="submit"
            name="status"
            value="dismissed"
            disabled={pending}
            className="ease-brand rounded-lg border border-line-2 px-5 py-2.5 text-[15px] transition-colors duration-200 hover:border-ink-3 disabled:opacity-55"
          >
            Dismiss
          </button>
        </div>
        {state.error ? (
          <p role="alert" className="text-[14px] text-critical">
            {state.error}
          </p>
        ) : null}
      </form>
    </li>
  );
}
