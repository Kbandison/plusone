-- Referrals (§6.5, Decision #25).
--
-- The split follows the Drop: SQL records what happened, TypeScript decides what
-- it is worth. `packages/logic/referrals` holds the tier rules with 17 tests,
-- and restating them here would be a second implementation of who gets paid.
--
-- What the database does own is the moment of conversion, because that is an
-- event it can see and the app cannot be trusted to notice: a conversion counts
-- when an invitee reaches `verified` (§6.5), so a trigger records it. An app
-- that had to remember is an app that eventually forgets.

-- ── a permanent code ──────────────────────────────────────────────────────────
create or replace function public.my_referral_code()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := (select auth.uid());
  v_code text;
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select code into v_code from public.referrals where user_id = v_me;
  if v_code is not null then
    return v_code;
  end if;

  -- Eight lowercase base-36 characters. Retried on collision rather than
  -- assumed unique: at this size a birthday collision is unlikely and not
  -- impossible, and "unlikely" is not a constraint.
  for i in 1..10 loop
    v_code := lower(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 8));
    begin
      insert into public.referrals (user_id, code) values (v_me, v_code);
      return v_code;
    exception when unique_violation then
      -- try again
    end;
  end loop;

  raise exception 'could not allocate a referral code';
end;
$$;

-- ── attribution ───────────────────────────────────────────────────────────────
-- Called once, by the invitee, after they have an account. One attribution per
-- invitee forever (the unique constraint on invitee_id), so a member cannot
-- shop their signup around several referrers.
create or replace function public.attribute_referral(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := (select auth.uid());
  v_referrer uuid;
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select user_id into v_referrer from public.referrals where code = p_code;

  -- A bad code is not an error the invitee should see. They followed a link;
  -- whether it resolved is not their problem, and failing their signup over it
  -- would be absurd.
  if v_referrer is null or v_referrer = v_me then
    return false;
  end if;

  insert into public.referral_conversions (code, referrer_id, invitee_id)
  values (p_code, v_referrer, v_me)
  on conflict (invitee_id) do nothing;

  return found;
end;
$$;

-- ── conversion ────────────────────────────────────────────────────────────────
-- §6.5 — the conversion counts when the invitee reaches `verified`, not when
-- they sign up. A trigger, so it cannot be missed by whichever path happens to
-- set the status: onboarding, the admin queue, or a future one.
create or replace function public.mark_referral_converted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.verification_status = 'verified'
     and coalesce(old.verification_status, 'unverified') <> 'verified' then
    update public.referral_conversions
    set verified_at = coalesce(verified_at, now())
    where invitee_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists mark_referral_converted on public.profiles;

create trigger mark_referral_converted
  after update of verification_status on public.profiles
  for each row
  execute function public.mark_referral_converted();

-- ── what the reward job reads ─────────────────────────────────────────────────
-- Conversions that have happened and not yet been paid. `premium_grants.source`
-- carries the conversion id, which is what makes the job idempotent: it can run
-- twice, or crash halfway, without paying twice.
create or replace function public.unrewarded_conversions()
returns table (
  conversion_id uuid,
  referrer_id uuid,
  invitee_id uuid,
  verified_at timestamptz,
  referrer_conversion_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    rc.id,
    rc.referrer_id,
    rc.invitee_id,
    rc.verified_at,
    (
      select count(*) from public.referral_conversions prior
      where prior.referrer_id = rc.referrer_id
        and prior.verified_at is not null
        and prior.verified_at <= rc.verified_at
    )
  from public.referral_conversions rc
  where rc.verified_at is not null
    and not exists (
      select 1 from public.premium_grants g
      where g.source = 'referral:' || rc.id::text
    )
  order by rc.verified_at asc;
$$;

-- ── granting ──────────────────────────────────────────────────────────────────
create or replace function public.grant_referral_premium(
  p_conversion_id uuid,
  p_user_id uuid,
  p_days integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_not_end_user('grant_referral_premium');

  insert into public.premium_grants (user_id, source, expires_at)
  values (
    p_user_id,
    'referral:' || p_conversion_id::text,
    -- Stacks from the end of any premium they already hold, rather than from
    -- now. Granting from now would quietly shorten a reward for the members who
    -- earn them fastest.
    greatest(
      now(),
      coalesce((select max(expires_at) from public.premium_grants where user_id = p_user_id), now())
    ) + make_interval(days => p_days)
  );
end;
$$;

create or replace function public.record_referral_tier(
  p_user_id uuid,
  p_tier public.referral_tier,
  p_status public.reward_status,
  p_signals jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_not_end_user('record_referral_tier');

  insert into public.referral_rewards (user_id, tier, status, fraud_signals)
  values (p_user_id, p_tier, p_status, p_signals)
  on conflict (user_id, tier) do nothing;
end;
$$;

-- ── grants ────────────────────────────────────────────────────────────────────
grant execute on function public.my_referral_code() to authenticated;
grant execute on function public.attribute_referral(text) to authenticated;

-- The reward job's functions act across members and are cron-only, guarded the
-- same way the sweeps are.
do $$
declare v_fn text;
begin
  foreach v_fn in array array[
    'public.unrewarded_conversions()',
    'public.grant_referral_premium(uuid, uuid, integer)',
    'public.record_referral_tier(uuid, public.referral_tier, public.reward_status, jsonb)',
    'public.mark_referral_converted()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_fn);
    execute format('grant execute on function %s to service_role', v_fn);
  end loop;
end;
$$;

-- The policies and grants for referrals, referral_conversions and
-- referral_rewards already exist in 20260813000500_rls.sql and
-- 20260813000700_grants.sql. CREATE POLICY has no OR REPLACE, so repeating them
-- here fails the whole migration — which is how the admin queue migration first
-- broke.
--
-- Worth restating rather than re-declaring: referral state is readable by its
-- owner only, and it never reaches matching. packages/logic/drop has no field
-- for it, and a test scores two candidates identically whatever referral
-- properties are attached to them (§6.5).
