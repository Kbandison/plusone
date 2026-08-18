/**
 * Age from a birthdate (§5.2).
 *
 * Members see an age; the birthdate itself is never exposed. The 18+ rule is
 * enforced in the database by profiles_adult, and this is the same rule stated
 * where a form can give a useful answer before the insert fails.
 *
 * Both dates are ISO `YYYY-MM-DD` and compared as calendar dates, deliberately
 * not as instants: someone's birthday is a date in their own life, not a moment
 * in UTC, and doing this with Date arithmetic is how people turn 18 a day early
 * in one timezone and a day late in another.
 */

export const MINIMUM_AGE = 18;

/**
 * The other end of the age range a member may ask for.
 *
 * Beside MINIMUM_AGE rather than in the web app, because both ends are the same
 * rule and profiles_age_range_is_adult CHECKs them as one. It also has to be
 * reachable from a Client Component — the age slider is one — and the web
 * module that used to hold it is server-only.
 */
export const MAXIMUM_AGE = 120;

/**
 * The oldest age a member can put at the top of their range.
 *
 * NOT the same number as MAXIMUM_AGE, and the difference is the point.
 * MAXIMUM_AGE mirrors profiles_age_range_is_adult — a sanity bound on what the
 * column will hold. This is a product choice about what the slider offers, and
 * 120 was a track where nearly half the travel was ages nobody is.
 *
 * It applies to the PREFERENCE, never to a member's own age: nothing here stops
 * anybody over 80 joining, or being shown. It does mean a member older than
 * this cannot be reached by anyone who left their upper end where it started,
 * which is the cost of the shorter track and worth revisiting if the community
 * skews older than expected.
 */
export const OLDEST_PREFERENCE = 80;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export function parseIsoDate(value: string): CalendarDate | null {
  const m = ISO_DATE.exec(value);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12 || day < 1) return null;
  // Reject dates that do not exist — 2025-02-30 parses fine by regex and would
  // otherwise roll silently into March.
  if (day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function daysInMonth(year: number, month: number): number {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1] ?? 0;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Whole years elapsed. Returns null if either date is not a real date. */
export function ageOn(birthdate: string, today: string): number | null {
  const b = parseIsoDate(birthdate);
  const t = parseIsoDate(today);
  if (!b || !t) return null;

  let age = t.year - b.year;
  // Not had this year's birthday yet.
  if (t.month < b.month || (t.month === b.month && t.day < b.day)) age -= 1;
  return age;
}

/**
 * Whether someone is old enough. A 29 February birthday counts as having had a
 * birthday on 1 March in a common year, which falls out of the comparison above
 * rather than needing a special case.
 */
export function isAdult(birthdate: string, today: string): boolean {
  const age = ageOn(birthdate, today);
  return age !== null && age >= MINIMUM_AGE;
}
