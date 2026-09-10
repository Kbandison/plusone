-- Who arrived through a beta invitation, recorded while it is still knowable.
--
-- ── the fact that expires ───────────────────────────────────────────────────
--
-- `waitlist.accepted_at` marks an invitation as SPENT. It does not say which
-- account resulted, because the waitlist has no `user_id` and must not get one:
-- `WAITLIST_NEVER` bans `phone` as "a second identifier, and the one that signs
-- a member in", and a user_id is worse — it turns an address that merely ASKED
-- about an HSV and HIV app into an address bound to a member account. The
-- inference becomes a fact.
--
-- So the mark goes on the ACCOUNT, which already knows the member's condition
-- because that is what this app is. It adds no linkage that does not exist.
--
-- The moment of acceptance is the only place both halves are in hand: the OTP
-- has just verified, so there is an authenticated user, and the invitation
-- cookie is still on the request. Afterwards the pairing is unrecoverable —
-- an email on a list and an account keyed by phone, with no join between them.
--
-- Backlog 22 turns `shouldCreateUser` back to `true` when the beta ends, and
-- from that moment members arrive by a door that leaves no mark at all. This
-- has to exist BEFORE the beta opens, not before it closes.
--
-- ── what it is for ─────────────────────────────────────────────────────────
--
-- Backlog 29: thanking the testers. `is_premium()` already unions
-- `premium_grants`, so the thank-you is an insert keyed on `user_id` — which is
-- exactly what the waitlist cannot supply and this can. Whether the grant is
-- dated or permanent, and when it starts, is Kevin's and is not decided here.
--
-- ── no grant, deliberately ─────────────────────────────────────────────────
--
-- `profiles` carries NO whole-table grant — read off
-- information_schema.role_table_grants, not inferred: column-level only, 33
-- insert, 42 select, 32 update. A new column is therefore unreachable by a
-- member unless it is granted, and this one is not granted at all. That matters
-- more than usual: a member who could set this flag on themselves would be
-- minting their own claim on a premium grant.

alter table public.profiles
  add column if not exists joined_in_beta boolean not null default false;

comment on column public.profiles.joined_in_beta is
  'Arrived through a beta invitation. Written only by the service client at OTP verification, where the invite cookie and the new account are both in hand. NO grant to anon or authenticated: a member who could set this would be minting a claim on a premium grant. Never exposed to another member.';
