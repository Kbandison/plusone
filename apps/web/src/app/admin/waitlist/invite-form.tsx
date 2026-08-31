"use client";

import { useActionState, useState } from "react";

import { Card } from "@/app/ui";
import { Submit } from "@/app/auth-fields";
import { invite } from "./actions";

export interface InviteRow {
  readonly id: string;
  readonly email: string;
  readonly metro: string;
  readonly wantsBeta: boolean;
}

/**
 * Choosing who to let in.
 *
 * ── the "would test" filter is on by default ────────────────────────────────
 *
 * Two different jobs get done from this screen and they want different people.
 * Recruiting BETA TESTERS means inviting the ones who said they would install a
 * pre-release build; OPENING AN AREA means inviting everybody in it. Defaulting
 * to the first is the one that is happening now, and the checkbox says so
 * rather than the list quietly being partial.
 *
 * ── no select-all ───────────────────────────────────────────────────────────
 *
 * Deliberate. An invitation is an email to a real person about an HSV and HIV
 * app, and it cannot be recalled. One button that sends to everybody currently
 * filtered is exactly the control that gets pressed with the wrong filter set.
 * Ticking twelve boxes is slow, and slow is correct here.
 */
export function InviteForm({ rows }: { rows: readonly InviteRow[] }) {
  const [onlyTesters, setOnlyTesters] = useState(true);
  const [sent, submit, pending] = useActionState(async (_prev: boolean, formData: FormData) => {
    await invite(formData);
    return true;
  }, false);

  const shown = onlyTesters ? rows.filter((r) => r.wantsBeta) : rows;

  return (
    <Card className="mt-8">
      <h2 className="text-h3">Invite</h2>
      <p className="mt-2 text-[11.7px] leading-[1.6] text-ink-3">
        Confirmed, not yet invited. An invitation is good for 14 days and works once; re-issuing is
        not offered, because a second code would orphan the first and leave somebody holding a dead
        link.
      </p>

      {sent ? (
        <p className="mt-4 text-body text-ink-2">
          Sent. The rows move to Invited on the next load.
        </p>
      ) : null}

      <label className="mt-4 flex items-center gap-3 text-[12.2px]">
        <input
          type="checkbox"
          checked={onlyTesters}
          onChange={(event) => setOnlyTesters(event.currentTarget.checked)}
          className="size-5 shrink-0 accent-accent"
        />
        Only people who said they would test
      </label>

      {shown.length === 0 ? (
        <p className="mt-4 text-body text-ink-2">
          {rows.length === 0
            ? "Nobody confirmed and uninvited."
            : "Nobody matching. Untick the filter to see the rest."}
        </p>
      ) : (
        <form action={submit} className="mt-4 flex flex-col gap-4">
          <ul className="flex flex-col gap-2">
            {shown.map((row) => (
              <li key={row.id} className="flex items-center gap-3 border-t border-line-2 pt-2">
                <input
                  type="checkbox"
                  name="id"
                  value={row.id}
                  id={`invite-${row.id}`}
                  className="size-5 shrink-0 accent-accent"
                />
                <label
                  htmlFor={`invite-${row.id}`}
                  className="min-h-tap flex flex-1 items-center text-[12.6px]"
                >
                  <span className="flex-1 break-all">{row.email}</span>
                  <span className="ml-4 shrink-0 text-ink-3">{row.metro}</span>
                </label>
              </li>
            ))}
          </ul>

          <Submit label="Send invitations" pending={pending} />
        </form>
      )}
    </Card>
  );
}
