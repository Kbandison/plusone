-- A cap on resending the confirmation, which 20260831000100 has no way to hold.
--
-- Superseding rather than editing, per the standing rule: an applied migration
-- is a record of what ran. 000100 is live and stays as written.
--
-- ── what it missed ──────────────────────────────────────────────────────────
--
-- The join form takes an address and emails a confirmation to it. Nothing on
-- that row records WHEN, so the only two implementable policies were both
-- wrong:
--
--   send every time      An email bomb aimed at one person, from us, from a
--                        domain whose name they then have to explain. On this
--                        app that is not spam, it is outing somebody by volume.
--   send only on insert  Anyone who loses the first email is stuck forever,
--                        because the address is taken and the token is only in
--                        the mail they cannot find.
--
-- `confirm_sent_at` is what makes the third option possible: resend, but not
-- more than once an hour per address. `created_at` cannot do this job — it
-- never moves, so it can express "first send" and nothing after it.
--
-- Deliberately NOT a counter. A count would let us refuse after N attempts,
-- which sounds stricter and is worse: the person being bombed is not the person
-- submitting, and locking the address is a denial of service against the victim
-- rather than the attacker.

alter table public.waitlist
  add column if not exists confirm_sent_at timestamptz;

comment on column public.waitlist.confirm_sent_at is
  'When the confirmation was last emailed. Rate limit only - one per hour per address. See the migration header for why this is not a counter.';

-- No grant. `waitlist` is granted to nobody and this column changes nothing
-- about that; the service client is still the only writer. Restated because a
-- column added to an existing table is exactly where the new-table revoke rule
-- looks like it does not apply, and somebody will one day add a grant here out
-- of habit.
