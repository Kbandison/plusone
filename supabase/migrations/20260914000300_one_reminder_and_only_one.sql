-- One reminder, and a column that makes that true rather than intended.
--
-- ── why a manual button did not need this and a cron does ──────────────────
--
-- `remindUnconfirmed` already refuses to send twice inside
-- WAITLIST_REMINDER_AFTER_DAYS, which is enough when a person presses a button
-- occasionally. It is not enough once a schedule presses it: a floor of three
-- days against a thirty-day TTL is nine reminders, sent automatically, to
-- somebody who never confirmed and may never have asked.
--
-- The copy is what makes this a correctness problem rather than a preference.
-- WAITLIST_EMAIL.confirm promises "the most you will hear from us before then
-- is one reminder", and WAITLIST_EMAIL.remind says in its own body that it is
-- the last email. A schedule with only a cooldown behind it would make both
-- sentences false, to the one population double opt-in exists to protect.
--
-- So the guarantee moves into the data: `reminded_at is null` is the condition
-- to send, and sending sets it. There is no path that sends a second one.
--
-- ── it is NOT confirm_sent_at, and the difference matters ──────────────────
--
-- confirm_sent_at already moves when a reminder goes out, and it looked like
-- enough. It is not: `joinWaitlist` writes it too, on a repeat submission of
-- the public form. So "confirm_sent_at is later than created_at" means EITHER
-- we reminded them OR they filled the form in again — and the second is
-- somebody actively asking, who would then be denied the reminder they never
-- got. Two different facts cannot share one column.
--
-- confirm_sent_at stays as the cooldown, which is its job. This is the ledger.
--
-- ── no grants, no policy, deliberately ─────────────────────────────────────
--
-- `waitlist` is granted to neither anon nor authenticated and carries force row
-- level security with no policies — the service client is the only reader and
-- writer, and 20260831000100 has the full argument. A column added to it
-- inherits that, so there is nothing to grant and nothing to revoke. check:db
-- asserts the closed shape holds, which is what would catch this going wrong.

alter table public.waitlist
  add column if not exists reminded_at timestamptz;

-- The word "condition" is deliberately absent below, and not for style. This
-- table's guard greps the schema for terms a waitlist row must never carry, a
-- COMMENT literal is not stripped the way a `--` line is, and the sentence that
-- used to be here tripped it. The guard was right to fire: it cannot tell a
-- column name from prose, and that is exactly why it is worth having.
comment on column public.waitlist.reminded_at is
  'When the one confirmation reminder was sent. Null means it has not been, and null is what permits a send — NOT a cooldown. The confirmation email promises at most one reminder; a schedule behind a three-day floor would send nine.';

-- Everybody already on the list has had no reminder, which is what null says,
-- so there is no backfill. Stated because the absence of one is a decision: the
-- 20 rows sitting unconfirmed when this was written are exactly the population
-- the first scheduled run is for.
