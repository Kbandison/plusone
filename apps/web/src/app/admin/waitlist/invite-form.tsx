"use client";

import { useActionState, useMemo, useState } from "react";

import { Card } from "@/app/ui";
import { Submit } from "@/app/auth-fields";
import { invite } from "./actions";

export interface InviteRow {
  readonly id: string;
  readonly email: string;
  readonly metro: string;
  readonly label: string;
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
 * ── grouped by metro, because that is the unit an invitation round is in ────
 *
 * A flat list sorted by signup date spreads one area across the whole page, and
 * the thing being decided here is almost always "open Houston", not "invite
 * these nine individuals". RADIUS.ladderMi stops at 250 miles and DROP.perNight
 * is three, so a tester with nobody within 250 miles opens the app to
 * COPY.drop.thin for ever — inviting one person per metro produces the one
 * outcome the waitlist exists to prevent. WAITLIST_METRO_TARGET is the number
 * to aim at and the header of each group counts against it.
 *
 * ── select-all, per metro ONLY ──────────────────────────────────────────────
 *
 * This file used to refuse select-all outright, and the reason was good: "an
 * invitation is an email to a real person about an HSV and HIV app, and it
 * cannot be recalled. One button that sends to everybody currently filtered is
 * exactly the control that gets pressed with the wrong filter set."
 *
 * That objection is about an UNBOUNDED control, and a metro group is not one.
 * It is named, it is counted, the addresses are on screen above the box, and it
 * cannot reach anybody in another area however the tester filter is set. The
 * global version is still refused — there is deliberately no button that
 * selects every group at once, which is the one the sentence above is about.
 */
export function InviteForm({ rows }: { rows: readonly InviteRow[] }) {
  const [onlyTesters, setOnlyTesters] = useState(true);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [sent, submit, pending] = useActionState(async (_prev: boolean, formData: FormData) => {
    await invite(formData);
    setPicked(new Set());
    return true;
  }, false);

  /**
   * One pass, grouped, and memoised on the two things that can change it.
   *
   * A Map keyed on metro rather than METROS.map(filter), which walks every row
   * once per metro — 43 of them, against a list that only ever holds the people
   * confirmed and not yet invited. Insertion order preserves the row order the
   * server sent, which is oldest first.
   */
  const groups = useMemo(() => {
    const by = new Map<string, { label: string; rows: InviteRow[] }>();
    for (const row of rows) {
      if (onlyTesters && !row.wantsBeta) continue;
      const group = by.get(row.metro) ?? { label: row.label, rows: [] };
      group.rows.push(row);
      by.set(row.metro, group);
    }
    return [...by.entries()]
      .map(([metro, g]) => ({ metro, ...g }))
      .sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label));
  }, [rows, onlyTesters]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const toggleGroup = (ids: readonly string[], all: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const id of ids)
        if (all) next.delete(id);
        else next.add(id);
      return next;
    });

  return (
    <Card className="mt-8">
      <h2 className="text-h3">Invite</h2>
      <p className="mt-2 text-[11.7px] leading-[1.6] text-ink-3">
        Confirmed, not yet invited, grouped by area — the biggest first. An invitation is good for
        14 days and works once; re-issuing is not offered, because a second code would orphan the
        first and leave somebody holding a dead link.
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

      {groups.length === 0 ? (
        <p className="mt-4 text-body text-ink-2">
          {rows.length === 0
            ? "Nobody confirmed and uninvited."
            : "Nobody matching. Untick the filter to see the rest."}
        </p>
      ) : (
        <form action={submit} className="mt-4 flex flex-col gap-6">
          {groups.map((group) => {
            const ids = group.rows.map((r) => r.id);
            const all = ids.every((id) => picked.has(id));
            return (
              <fieldset key={group.metro} className="flex flex-col gap-2">
                <legend className="sr-only">{group.label}</legend>
                <div className="flex items-center justify-between border-b border-line-2 pb-2">
                  <span className="text-[12.6px]">
                    {group.label}{" "}
                    <span className="text-ink-3">
                      · {group.rows.length} {group.rows.length === 1 ? "person" : "people"}
                    </span>
                  </span>
                  {/* Bounded to this metro. There is no button that does every
                      group at once — see the note above the component. */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(ids, all)}
                    className="min-h-tap text-[11.7px] underline decoration-line-2 underline-offset-4 hover:text-ink"
                  >
                    {all ? "Clear" : `Select ${group.rows.length}`}
                  </button>
                </div>

                {group.rows.map((row) => (
                  <div key={row.id} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      name="id"
                      value={row.id}
                      id={`invite-${row.id}`}
                      checked={picked.has(row.id)}
                      onChange={() => toggle(row.id)}
                      className="size-5 shrink-0 accent-accent"
                    />
                    <label
                      htmlFor={`invite-${row.id}`}
                      className="min-h-tap flex flex-1 items-center break-all text-[12.6px]"
                    >
                      {row.email}
                    </label>
                  </div>
                ))}
              </fieldset>
            );
          })}

          <Submit
            label={picked.size === 0 ? "Send invitations" : `Send ${picked.size}`}
            pending={pending}
          />
        </form>
      )}
    </Card>
  );
}
