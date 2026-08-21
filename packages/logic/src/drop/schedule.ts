/**
 * When a drop lands (§6.1, DROP.hourLocal).
 *
 * The hour has been declared since Milestone 1 and read by nothing. A drop was
 * keyed on the member's local CALENDAR date, so it arrived whenever they first
 * opened the app that day — 00:01, or 7am on the way to work. "Three a night"
 * was three a day, and the one number that said otherwise was config nobody
 * called.
 *
 * That matters beyond tidiness. A nightly drop is the product's whole rhythm:
 * it is why there is no infinite feed, and it is the thing a member plans an
 * evening around. Landing it at midnight makes it a daily allowance instead.
 *
 * Pure, and every function takes `now` — the same rule the rest of this package
 * follows, because a clock read inside a function cannot be tested.
 */

/** The member's local calendar date, as YYYY-MM-DD. */
function localDate(now: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
  } catch {
    // An unknown timezone must not cost somebody their drop.
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(now);
  }
}

/** The member's local hour, 0–23. */
export function localHour(now: Date, timezone: string): number {
  const read = (zone: string) =>
    Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        hour: "numeric",
        // h23 rather than hour12:false — the latter renders midnight as "24"
        // in some engines, which is a whole day out on the one hour it matters.
        hourCycle: "h23",
      }).format(now),
    );

  try {
    return read(timezone);
  } catch {
    return read("UTC");
  }
}

/** One day back from a YYYY-MM-DD string. */
function dayBefore(date: string): string {
  // Noon UTC, so the arithmetic cannot land on a day boundary and no DST rule
  // anywhere can move it. Only the calendar date is being changed here; the
  // timezone work is already done.
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() - 1);
  return at.toISOString().slice(0, 10);
}

/**
 * Which night's drop is the current one.
 *
 * The key a drop is stored under. A "night" runs from `hourLocal` to
 * `hourLocal` — so at 19:00 you are still on last night's three, and at 20:01
 * tonight's have landed. Returning the previous date before the hour is what
 * makes the drop wait rather than making the member wait for the drop.
 */
export function dropNightDate(now: Date, timezone: string, hourLocal: number): string {
  const today = localDate(now, timezone);
  return localHour(now, timezone) < hourLocal ? dayBefore(today) : today;
}

/**
 * Whether the next drop is still coming tonight, or is tomorrow's.
 *
 * Before the hour, tonight's has not landed. After it, the next one is
 * tomorrow's — which is the same test, and the reason it is one function.
 */
export function nextDropIsToday(now: Date, timezone: string, hourLocal: number): boolean {
  return localHour(now, timezone) < hourLocal;
}

/**
 * An hour of the day as a member would say it. 20 → "8pm", 0 → "12am".
 *
 * Here rather than in the copy file because it is arithmetic, and copy that has
 * to do arithmetic is copy nobody can safely edit.
 */
export function clockLabel(hour: number): string {
  const h = ((Math.trunc(hour) % 24) + 24) % 24;
  const suffix = h < 12 ? "am" : "pm";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}${suffix}`;
}
