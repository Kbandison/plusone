/**
 * When a message was sent, said the way a person would say it.
 *
 * Pure, and given `now` rather than reading the clock, because the same
 * message renders on the server and again on the client and the two must agree
 * — a function that calls Date.now() produces "2 minutes ago" on the server and
 * "3 minutes ago" on the client, which React reports as a hydration mismatch on
 * a screen that has one of these per bubble.
 *
 * The parts are separated on purpose. `messageTimeLabel` is what a member reads
 * and changes with the clock; `messageTimeExact` is what goes in the title and
 * the datetime attribute, and does not.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Midnight local to `zone`, as a timestamp. */
function startOfDay(at: number, zone: string): number {
  // en-CA gives YYYY-MM-DD, which Date.parse reads as UTC midnight — so the
  // subtraction below is between two same-basis numbers rather than between a
  // local date and a UTC one.
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date(at));
  return Date.parse(`${day}T00:00:00Z`);
}

/**
 * "09:41", "Yesterday 22:10", "12 Aug 09:41".
 *
 * Time alone for today, because a conversation that is happening now needs the
 * hour and nothing else. A date once it is not today, because "09:41" on its
 * own silently claims to be recent.
 */
export function messageTimeLabel(sentAt: number, now: number, zone = "UTC"): string {
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(sentAt));

  const daysApart = Math.round((startOfDay(now, zone) - startOfDay(sentAt, zone)) / DAY);

  if (daysApart <= 0) return clock;
  if (daysApart === 1) return `Yesterday ${clock}`;

  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    day: "numeric",
    month: "short",
    // A year only once it is a different one. "12 Aug 2025" on a message from
    // last week is noise that reads as precision.
    ...(new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric" }).format(
      new Date(sentAt),
    ) !==
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric" }).format(new Date(now))
      ? { year: "numeric" as const }
      : {}),
  }).format(new Date(sentAt));

  return `${date} ${clock}`;
}

/** The unabbreviated form, for a tooltip and for the datetime attribute. */
export function messageTimeExact(sentAt: number, zone = "UTC"): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(sentAt));
}

/**
 * Whether a gap is long enough that the thread should say so.
 *
 * A run of messages inside a few minutes is one exchange and does not need a
 * date between every line; a gap of a day is a different conversation wearing
 * the same thread.
 */
export function needsDateSeparator(
  previousAt: number | null,
  sentAt: number,
  zone = "UTC",
): boolean {
  if (previousAt === null) return true;
  return startOfDay(sentAt, zone) > startOfDay(previousAt, zone);
}

/**
 * The label on a day divider: "Today", "Yesterday", "12 Aug".
 *
 * Separate from messageTimeLabel rather than derived by trimming the clock off
 * it — a divider for today would come back as an empty string, and the first
 * version of this did exactly that.
 */
export function dateSeparatorLabel(sentAt: number, now: number, zone = "UTC"): string {
  const daysApart = Math.round((startOfDay(now, zone) - startOfDay(sentAt, zone)) / DAY);
  if (daysApart <= 0) return "Today";
  if (daysApart === 1) return "Yesterday";

  const sameYear =
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric" }).format(
      new Date(sentAt),
    ) ===
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric" }).format(new Date(now));

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" as const }),
  }).format(new Date(sentAt));
}

/**
 * "45s", "5m", "3h", "2d", "12 Aug" — the age of a post in a feed.
 *
 * Short because it repeats. A feed shows this once per row, and "3 hours ago"
 * on forty rows is forty copies of the word hours; the unit letter carries the
 * same meaning in a twentieth of the width, which is why every feed converges
 * on it.
 *
 * It stops being relative after a week. "9d" is arithmetic a reader has to do,
 * and a date is what they were going to work out anyway.
 *
 * Pure, and given `now`, for the same reason as everything above it: the same
 * post renders on the server and again on the client, and a function that reads
 * the clock makes those two disagree.
 */
export function compactAge(sentAt: number, now: number, zone = "UTC"): string {
  const elapsed = Math.max(0, now - sentAt);

  if (elapsed < MINUTE) return `${Math.floor(elapsed / 1000)}s`;
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d`;

  const sameYear =
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric" }).format(
      new Date(sentAt),
    ) ===
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric" }).format(new Date(now));

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "2-digit" as const }),
  }).format(new Date(sentAt));
}
