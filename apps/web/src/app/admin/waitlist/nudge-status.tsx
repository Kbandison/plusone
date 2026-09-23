import { Card } from "@/app/ui";

export interface NudgeRow {
  readonly id: string;
  readonly email: string;
  readonly label: string;
  readonly expiresInDays: number;
  readonly nudgesSent: number;
  readonly nextNudge: string | null;
}

/**
 * Invited, not joined — and where each person is in the three nudges.
 *
 * STATUS ONLY, Kevin's call 2026-09-23. The hourly cron is the only thing that
 * sends these, so this screen shows what it has sent and when it will send the
 * next, and has no button: a manual send would be a fourth path into a schedule
 * built around exactly three. `nextNudge` comes from nextInviteNudge, which asks
 * the same functions the cron does.
 *
 * A server component with no form, deliberately — nothing here can write.
 */
export function NudgeStatus({ rows }: { rows: readonly NudgeRow[] }) {
  if (rows.length === 0) return null;

  return (
    <Card className="mt-8">
      <p className="text-[11.7px] leading-[1.6] text-ink-3">
        {rows.length} {rows.length === 1 ? "person is" : "people are"} holding a link they have not
        used. Each gets three reminders at 7pm their time: three days in, with a week left, and on
        the last day.
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-x-2 break-all text-[12.6px]">
            {row.email}
            <span className="text-[11.7px] text-ink-3">
              · {row.label} ·{" "}
              {row.expiresInDays <= 1 ? "expires today" : `${row.expiresInDays} days left`} ·{" "}
              {row.nudgesSent === 0 ? "no reminder yet" : `reminder ${row.nudgesSent} of 3 sent`}
              {row.nextNudge ? ` · next ${row.nextNudge}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
