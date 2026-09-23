"use client";

import { useActionState, useState } from "react";

import { Card } from "@/app/ui";
import { Submit } from "@/app/auth-fields";
import { nudgeInvited } from "./actions";

export interface NudgeRow {
  readonly id: string;
  readonly email: string;
  readonly label: string;
  readonly expiresInDays: number;
  readonly nudgeable: boolean;
}

/**
 * Invited, never used it, code still live.
 *
 * ── one control, and it is not invite ──────────────────────────────────────
 *
 * These people already have a working link. Re-inviting them would mint a
 * second code and orphan the first, which `inviteFromWaitlist` refuses on a
 * line of its own — so this screen offers the only thing that helps: telling
 * them the one they have is about to stop working.
 *
 * No select-all, for the reason `invite-form.tsx` gives about its own global
 * version: this list is not bounded by anything a person named.
 */
export function NudgeForm({ rows }: { rows: readonly NudgeRow[] }) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [sent, submit, pending] = useActionState(
    async (_prev: number | null, formData: FormData) => {
      const count = await nudgeInvited(formData);
      setPicked(new Set());
      return count;
    },
    null,
  );

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  if (rows.length === 0) return null;

  return (
    <Card className="mt-8">
      <h2 className="text-h3">Invited, not joined</h2>
      <p className="mt-2 text-[11.7px] leading-[1.6] text-ink-3">
        {rows.length} {rows.length === 1 ? "person is" : "people are"} holding a link they have not
        used. One reminder each, and it says when the link stops working. Re-inviting is not
        offered: they already have a code, and a second would kill the first.
      </p>

      {/* Zero is louder than silence — the same lesson the invite button
          learned when "Sent." covered a send of none. */}
      {sent === null ? null : sent === 0 ? (
        <p role="alert" className="mt-4 text-body text-critical">
          Nothing sent. Everyone selected had already been reminded, or joined.
        </p>
      ) : (
        <p role="status" className="mt-4 text-body text-ink-2">
          Sent {sent}.
        </p>
      )}

      <form action={submit} className="mt-4 flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-3">
            <input
              type="checkbox"
              name="id"
              value={row.id}
              id={`nudge-${row.id}`}
              checked={picked.has(row.id)}
              disabled={!row.nudgeable}
              onChange={() => toggle(row.id)}
              className="size-5 shrink-0 accent-accent disabled:opacity-55"
            />
            <label
              htmlFor={`nudge-${row.id}`}
              className="min-h-tap flex flex-1 flex-wrap items-center gap-x-2 break-all text-[12.6px]"
            >
              {row.email}
              <span className="text-[11.7px] text-ink-3">
                · {row.label} ·{" "}
                {row.expiresInDays <= 1 ? "expires today" : `${row.expiresInDays} days left`}
                {row.nudgeable ? "" : " · reminded"}
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
