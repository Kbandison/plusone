"use client";

import { useActionState } from "react";

import { FEEDBACK_STATUS_LABELS, type FeedbackStatus } from "@plusone/config";

import { buttonClass, Card } from "@/app/ui";
import { setStatus } from "./actions";
import { TRIAGE_INITIAL } from "./state";

export interface FeedbackRow {
  readonly id: string;
  readonly kind: string;
  readonly body: string;
  readonly status: FeedbackStatus;
  readonly surface: string | null;
  readonly page: string | null;
  readonly appVersion: string | null;
  readonly createdAt: string;
  readonly adminNote: string | null;
}

const STATUSES: FeedbackStatus[] = ["new", "seen", "done", "declined"];

export function TriageRow({ row }: { row: FeedbackRow }) {
  const [state, submit, pending] = useActionState(setStatus, TRIAGE_INITIAL);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px] text-ink-3">
        <span className="tracking-[0.03em] text-ink-2 uppercase">{row.kind}</span>
        <span>{FEEDBACK_STATUS_LABELS[row.status]}</span>
        <time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString()}</time>
      </div>

      <p className="mt-3 text-body leading-[1.6] whitespace-pre-wrap">{row.body}</p>

      {/* The three facts that decide whether this is actionable. `surface` most
          of all: AGENTS.md makes it a standing rule that a fix verified in one
          engine is not verified in the other, so a report that does not say
          which engine saw it cannot be acted on without asking. */}
      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-ink-3">
        <div className="flex gap-2">
          <dt className="text-ink-2">Surface</dt>
          <dd>{row.surface ?? "unknown"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-ink-2">Screen</dt>
          <dd>{row.page ?? "unknown"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-ink-2">Version</dt>
          <dd>{row.appVersion ?? "unknown"}</dd>
        </div>
      </dl>

      <form action={submit} className="mt-5 flex flex-col gap-3">
        <input type="hidden" name="id" value={row.id} />

        <label className="flex flex-col gap-2">
          <span className="text-[12.2px]">Reply to them</span>
          {/* Rendered on their own copy of the report, so this is a reply and
              not a private note. Named that way so nobody writes an internal
              aside into it. */}
          <textarea
            name="note"
            rows={2}
            defaultValue={row.adminNote ?? ""}
            placeholder="Shown to the member on their report."
            className="w-full rounded-lg border border-line-control bg-surface px-4 py-3 text-[16px]"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {STATUSES.map((status) => (
            <button
              key={status}
              type="submit"
              name="status"
              value={status}
              disabled={pending || row.status === status}
              className={buttonClass(status === "declined" ? "danger" : "secondary", "text-[12px]")}
            >
              {FEEDBACK_STATUS_LABELS[status]}
            </button>
          ))}
        </div>

        {state.message ? <p className="text-[11.7px] text-ink-2">{state.message}</p> : null}
        {state.error ? (
          <p role="alert" className="text-[11.7px] text-critical">
            {state.error}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
