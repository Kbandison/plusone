-- The grant says who it reached, so they can be told.
--
-- ── the welcome makes a promise this has to keep ───────────────────────────
--
-- BETA_WELCOME tells a tester their three months start "when Plus One opens in
-- your area". That opening is Kevin pressing a button in /admin/members — an
-- event with no screen, on a day the member has no reason to be looking. So
-- either something tells them, or the promise is only kept for whoever happens
-- to open Settings afterwards, which is the shape of a promise not kept.
--
-- `notify()` needs user ids and this returned a COUNT, so there was nothing to
-- send to. It now returns the rows it inserted.
--
-- ── DROP and recreate, because the return type changes ─────────────────────
--
-- `create or replace function` cannot change a function's return type — it
-- fails at execution with "cannot change return type of existing function",
-- and `check:sql` passes it either way because the statement is legal grammar.
-- That exact thing was found by a dry run earlier this month and is in
-- HANDOFF.md; this file is written knowing it rather than discovering it.
--
-- 20260914000200 is NOT edited. An applied migration is a record of what ran.
--
-- ── everything else is unchanged, deliberately ─────────────────────────────
--
-- The body below is 20260914000200's, with the insert given a `returning` and
-- the count dropped. The four properties it was written for are all still
-- here and all still pinned by admin-routes.test.ts: the admin wall, the
-- duration bounds, `is not distinct from` so the member with no location is
-- reachable, the seeded exclusion, and the ever-granted check that makes a
-- second press do nothing.
--
-- The caller changes shape with it: `rows.length` is the number it used to
-- return, so nothing downstream loses the count.

drop function if exists public.admin_grant_beta_thanks(text, integer);

create function public.admin_grant_beta_thanks(
  p_metro text,
  p_months integer default 3
)
returns table (user_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_months < 1 or p_months > 24 then
    raise exception 'a thank-you runs between one and twenty-four months'
      using errcode = '22023';
  end if;

  return query
  with owed as (
    select p.id
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.joined_in_beta
       -- `is not distinct from`, so null matches null. A member with no
       -- location has no metro, and `= null` would leave them permanently
       -- listed as owed and permanently ungrantable — a pending row with no
       -- button, which is worse than not listing them at all.
       and public.metro_for(p.location) is not distinct from p_metro
       -- A seeded account is not a person and must not hold a grant. Same
       -- predicate remove-test-members.mjs deletes on.
       and (u.email is null or u.email not like '%@seed.plusone.invalid')
       -- Idempotent: running it twice for one metro grants nobody twice, which
       -- matters because the only way to know it worked is to run it.
       and not exists (
         select 1 from public.premium_grants g
          where g.user_id = p.id and g.source = 'beta_thanks'
       )
  )
  insert into public.premium_grants (user_id, source, expires_at)
  select owed.id, 'beta_thanks', now() + make_interval(months => p_months)
    from owed
  -- The whole point of this migration. Idempotency lives in the `not exists`
  -- above, so a second press inserts nothing and returns nobody — which means
  -- the caller cannot double-notify either, without doing anything about it.
  returning premium_grants.user_id;
end;
$$;

revoke all on function public.admin_grant_beta_thanks(text, integer) from public, anon;
grant execute on function public.admin_grant_beta_thanks(text, integer) to authenticated;

comment on function public.admin_grant_beta_thanks(text, integer) is
  'Grants a dated premium thank-you to beta joiners in one metro and RETURNS THEM, so the caller can notify. Idempotent on source = beta_thanks. Seeded accounts never receive one.';
