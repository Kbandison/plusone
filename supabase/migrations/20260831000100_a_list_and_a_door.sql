-- A waitlist, and the door it opens.
--
-- Kevin's call, 2026-08-31: Plus One goes to a closed beta, the waitlist
-- becomes the front door, and nobody creates an account without an invitation.
--
-- ── why a waitlist is the right shape for THIS app ───────────────────────────
--
-- Three strings already in the product admit that a thin local pool is a real
-- outcome: COPY.drop.thin, COPY.radius.expansionNotice, and HOW_IT_WORKS' "if
-- there are not many people near you, you get fewer and we say so". All three
-- are honest and all three were dead ends — the member who met them had nothing
-- to do but leave. This table is what turns them into a plan: hold people by
-- metro, open a metro when it is worth opening.
--
-- ── the constraint that decides every column below ──────────────────────────
--
-- AN EMAIL ADDRESS ON THIS LIST IS A HEALTH DISCLOSURE BY INFERENCE. Plus One
-- is a named, public HSV and HIV app. Being on its list says something about a
-- person that they may not have said to anyone, and unlike a profile they have
-- not yet agreed to anything or read a consent screen.
--
-- So this table holds the two things a launch decision actually needs and
-- nothing else. `WAITLIST_NEVER` in packages/config/src/waitlist.ts is the
-- explicit list of what it must never grow, with the plausible-sounding
-- argument for each one written out beside it, and waitlist.test.ts reads THIS
-- FILE and fails on a column matching any of them. The list is not advice.
--
-- ── and why it holds no policies at all ─────────────────────────────────────
--
-- Every other table here grants a member access to their own rows. This one
-- grants nobody anything: RLS is on and there is not one policy, so `anon` and
-- `authenticated` can neither read nor write a single row through PostgREST.
--
-- That is deliberate rather than unfinished. There is no member behind a
-- waitlist row — the whole point is that they do not have an account — so
-- "their own rows" has no meaning, and every operation is performed by the
-- service client from a server action that owns the whole request.
--
-- The specific hole it closes: `join` has to mint a confirmation token, and a
-- definer RPC callable by `anon` would RETURN that token to whoever called it.
-- Anybody could then join with somebody else's address, receive the token in
-- the response, and confirm it themselves — which defeats the confirmation step
-- entirely and puts a real person on this list without their knowledge. The
-- token never leaving the server is what makes double opt-in mean anything.

create table if not exists public.waitlist (
  id uuid primary key default extensions.gen_random_uuid(),

  -- Stored lowercase so the unique index is the whole answer. citext is not an
  -- installed extension here (only pgcrypto and postgis are), and adding one
  -- for a single column is more surface than a CHECK.
  email text not null,

  -- A metro id from METROS in packages/config/src/waitlist.ts.
  --
  -- The constraint is a SHAPE, not a membership test, and that is a considered
  -- trade rather than laziness. An enum or a value list would put 43 American
  -- cities in the schema and make adding one a migration — for a list that will
  -- certainly change, and whose changes carry no risk. Membership is checked in
  -- TypeScript, which is also where the labels live, and a test pins the two
  -- together the way draft-copy.test.ts pins conditions to their enum.
  --
  -- What the database is for here is refusing garbage: no free text, no
  -- address, nothing with a space in it. The finest thing this row can ever say
  -- about a person is which of ~40 regions they picked.
  metro text not null,

  wants_beta boolean not null default false,

  -- One token, two jobs: confirming and leaving.
  --
  -- Both are "prove you hold this mailbox", so a second token would be a second
  -- thing to leak and no extra proof. It is unguessable and it is never
  -- rendered on a page — it exists only in the email and in the URL of a link
  -- from it.
  token text not null,

  -- Null until they tap the link. An unconfirmed row is somebody who never
  -- asked: never invited, never counted in a density figure, and swept after
  -- WAITLIST_UNCONFIRMED_TTL_DAYS by the purge cron.
  confirmed_at timestamptz,

  invite_code text,
  invited_at timestamptz,
  accepted_at timestamptz,

  -- Collected at invite ACCEPTANCE, not at join, and only from people who asked
  -- to test. Play needs the tester's Google account address and TestFlight needs
  -- their Apple ID — neither is necessarily the address they gave us, and both
  -- are more identifying than the one that is. Asking for it up front would
  -- mean holding a store-account identity for people who never test anything.
  store_platform text,
  store_account_email text,

  created_at timestamptz not null default now(),

  constraint waitlist_email_lowercase check (email = lower(email)),
  constraint waitlist_email_shape
    check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint waitlist_metro_shape check (metro ~ '^[a-z][a-z0-9-]{1,30}$'),
  constraint waitlist_store_platform
    check (store_platform is null or store_platform in ('ios', 'android')),
  constraint waitlist_store_email_lowercase
    check (store_account_email is null or store_account_email = lower(store_account_email)),

  -- An invite cannot be accepted before it was issued, and cannot be issued
  -- without a code. Both are true by construction in the actions that write
  -- them; stated here because "by construction" stops being true the second
  -- somebody writes a second writer.
  constraint waitlist_invite_is_coherent
    check (
      (invite_code is null and invited_at is null and accepted_at is null)
      or (invite_code is not null and invited_at is not null)
    )
);

create unique index if not exists waitlist_email_key on public.waitlist (email);
create unique index if not exists waitlist_token_key on public.waitlist (token);

-- Partial: only issued invites need a unique code, and the overwhelming
-- majority of rows have none.
create unique index if not exists waitlist_invite_code_key
  on public.waitlist (invite_code) where invite_code is not null;

-- The admin screen groups by metro and asks how many are confirmed. Small
-- table, but this is the only query it runs and it will run on every load.
create index if not exists waitlist_metro_confirmed_idx
  on public.waitlist (metro, confirmed_at);

comment on table public.waitlist is
  'People waiting for their area to open. Email and metro only - see WAITLIST_NEVER in packages/config/src/waitlist.ts for what this must never hold, and why. No RLS policies by design: the service client is the only writer.';

-- ── the grants a new table arrives with ─────────────────────────────────────
--
-- 20260826000200 is the whole argument and it was written after two tables kept
-- privileges nobody granted them: Supabase ships `alter default privileges ...
-- grant all on tables to anon, authenticated`, so a NEW table arrives with the
-- full set. The opening revoke in 20260813000700 covered what existed in August
-- and has nothing to say about this one.
--
-- Nothing is granted back. That is the only table in this schema for which that
-- is true, and it is the point rather than an omission.
revoke all on public.waitlist from anon, authenticated;

alter table public.waitlist enable row level security;

-- Belt and braces against the day somebody adds a permissive policy without
-- reading the header: with no grant, a policy alone still cannot open this.
-- Postgres consults privileges before policies.
alter table public.waitlist force row level security;
