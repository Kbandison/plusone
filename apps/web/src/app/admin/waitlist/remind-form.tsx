"use client";

import { useActionState, useState } from "react";

import { Card } from "@/app/ui";
import { Submit } from "@/app/auth-fields";
import { remind } from "./actions";

export interface RemindRow {
  readonly id: string;
  readonly email: string;
  readonly label: string;
  readonly remindable: boolean;
  readonly reminded: boolean;
  readonly deletesInDays: number;
}

/**
 * The people who signed up and never confirmed.
 *
 * ── what this screen deliberately cannot do ─────────────────────────────────
 *
 * There is no invite control here and there is no select-all. An unconfirmed
 * address may belong to somebody who never asked — a typo, or another person's
 * address — and the one thing that may be done about that is to ask the same
 * question again. `inviteFromWaitlist` refuses these rows on a line of its own,
 * so the wall is in the library and not only in the absence of a button.
 *
 * Select-all is refused for the reason `invite-form.tsx` gives about its own
 * global version: this list is not bounded by anything a person named. It is
 * every unconfirmed row there is, which is exactly the control that gets
 * pressed with the wrong thing in view.
 *
 * ── the deletion date is on the row, not in a paragraph ─────────────────────
 *
 * These rows are deleted 30 days after signup and a reminder does not move
 * that, so the useful number is per person and is the reason to act today
 * rather than a fact about the feature.
 */
export function RemindForm({ rows }: { rows: readonly RemindRow[] }) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [sent, submit, pending] = useActionState(async (_prev: boolean, formData: FormData) => {
    await remind(formData);
    setPicked(new Set());
    return true;
  }, false);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  if (rows.length === 0) return null;

  return (
    <Card className="mt-8">
      <h2 className="text-h3">Never confirmed</h2>
      <p className="mt-2 text-[11.7px] leading-[1.6] text-ink-3">
        {rows.length} {rows.length === 1 ? "person" : "people"} signed up and did not confirm, so
        they are not on the list and cannot be invited. One reminder goes out on its own at 7pm
        where they are; the button sends it now instead of waiting. Either way it is the only one,
        and it does not change when the address is deleted.
      </p>

      {sent ? <p className="mt-4 text-body text-ink-2">Sent.</p> : null}

      <form action={submit} className="mt-4 flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-3">
            <input
              type="checkbox"
              name="id"
              value={row.id}
              id={`remind-${row.id}`}
              checked={picked.has(row.id)}
              disabled={!row.remindable}
              onChange={() => toggle(row.id)}
              className="size-5 shrink-0 accent-accent disabled:opacity-55"
            />
            <label
              htmlFor={`remind-${row.id}`}
              className="min-h-tap flex flex-1 flex-wrap items-center gap-x-2 break-all text-[12.6px]"
            >
              {row.email}
              <span className="text-[11.7px] text-ink-3">
                · {row.label} ·{" "}
                {row.deletesInDays <= 0
                  ? "deleted today"
                  : `deleted in ${row.deletesInDays} ${row.deletesInDays === 1 ? "day" : "days"}`}
                {row.reminded ? " · reminded" : ""}
                {!row.reminded && !row.remindable ? " · emailed recently" : ""}
              </span>
            </label>
          </div>
        ))}

        <Submit
          label={picked.size === 0 ? "Send reminder" : `Remind ${picked.size}`}
          pending={pending}
        />
      </form>
    </Card>
  );
}
