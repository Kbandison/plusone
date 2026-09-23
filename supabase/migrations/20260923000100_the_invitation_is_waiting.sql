-- One nudge for an invitation nobody used.
--
-- ── the population this is for ─────────────────────────────────────────────
--
-- 36 people on 2026-09-23, holding a live code and having never spent it, all
-- expiring on 4 October. Kevin asked to reach "the ones that haven't joined yet
-- based on where they are in the steps", and this is the only step where a
-- nudge is both possible and useful.
--
-- The other step is not reachable at all, and that is worth recording here
-- rather than being rediscovered: every one of the six people who DID create an
-- account signed up by phone, so `auth.users.email` is null for all of them.
-- Two are stalled mid-onboarding with no email and no push subscription. There
-- is no channel to those two, by construction, until they add an address
-- themselves in Settings.
--
-- ── its own column, not the confirmation reminder's ────────────────────────
--
-- `reminded_at` records the one reminder to confirm an address. This is a
-- different email to a different population about a different thing, and
-- sharing the column would mean somebody who was reminded to confirm could
-- never be nudged about their invitation, and the reverse. Two facts, two
-- columns — the same argument that kept `reminded_at` out of confirm_sent_at.
--
-- ── one, and the schema is what makes that true ────────────────────────────
--
-- `invite_nudged_at is null` is the condition to send, and sending sets it.
-- There is no path that sends a second. A cooldown would be nine nudges over
-- the life of a code, which is not a nudge, and the copy promises one.
--
-- ── no grants, no policy ───────────────────────────────────────────────────
--
-- `waitlist` is granted to neither anon nor authenticated and carries force row
-- level security with no policies; a column added to it inherits that. Nothing
-- to grant and nothing to revoke — 20260831000100 has the full argument, and
-- check:db asserts the closed shape still holds.

alter table public.waitlist
  add column if not exists invite_nudged_at timestamptz;

comment on column public.waitlist.invite_nudged_at is
  'When the one "your invitation is still waiting" email was sent. Null means it has not been, and null is what permits a send — NOT a cooldown. Separate from reminded_at, which records the reminder to confirm an address.';
