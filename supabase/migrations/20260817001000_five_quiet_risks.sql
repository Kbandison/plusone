-- Five things that work today and fail on a plausible day.

-- ── 1. the admin lookup browsed the directory it was written to prevent ───────
-- admin_member_lookup interpolates the caller's string straight into a LIKE
-- pattern, guarded only by a two-character minimum. '%' and '_' are LIKE
-- metacharacters, so the two-character query '%%' matches every display_name
-- and returns the 25 most recent members — exactly the browse the function
-- exists to refuse. An administrator is meant to look someone up, not page
-- through everybody.
create or replace function public.admin_member_lookup(p_query text)
returns table (
  user_id uuid,
  display_name text,
  verification_status public.verification_status,
  created_at timestamptz,
  open_reports bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.display_name,
    p.verification_status,
    p.created_at,
    (select count(*) from public.moderation_queue m
      where m.subject_user_id = p.id and m.status = 'open')
  from public.profiles p
  where public.is_admin()
    and length(btrim(coalesce(p_query, ''))) >= 2
    and (
      -- Escaped, so a metacharacter is searched FOR rather than obeyed. The
      -- backslash goes first or it would double the escapes that follow it.
      p.display_name ilike
        '%' ||
        replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') ||
        '%' escape '\'
      -- An exact id, for following a report to its subject. Not a prefix
      -- search: browsing the member list by uuid fragment is not lookup.
      or p.id::text = btrim(p_query)
    )
  order by p.created_at desc
  limit 25;
$$;

revoke all on function public.admin_member_lookup(text) from public, anon;
grant execute on function public.admin_member_lookup(text) to authenticated;

-- ── 2. a fractional config value could brick connects and the fuse ────────────
-- admin_set_config checked only that the key exists and that jsonb_typeof is
-- 'number' or 'object'. config_int reads (value #>> '{}')::integer, and Postgres
-- REFUSES a fractional literal rather than rounding it — so setting
-- connects.free_per_day to 3.5 makes every call to config_int for that key raise,
-- and the connect budget, the fuse and the cooldowns stop working until somebody
-- notices and puts an integer back.
create or replace function public.admin_set_config(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old jsonb;
begin
  if not public.is_admin() then
    raise exception 'not an administrator' using errcode = '42501';
  end if;

  select c.value into v_old from public.app_config c where c.key = p_key;
  if v_old is null and not exists (select 1 from public.app_config c where c.key = p_key) then
    raise exception 'unknown config key: %', p_key using errcode = '22023';
  end if;

  if jsonb_typeof(p_value) not in ('number', 'object') then
    raise exception 'config values are numbers or objects' using errcode = '22023';
  end if;

  -- Fractions are legal ONLY for the drop weights, which are read as reals.
  -- Everything else is read through config_int and must survive a cast to
  -- integer.
  if p_key not like 'drop.weights.%'
     and jsonb_typeof(p_value) = 'number'
     and (p_value #>> '{}') !~ '^-?[0-9]+$' then
    raise exception 'config values are numbers or objects' using errcode = '22023';
  end if;

  update public.app_config
  set value = p_value, updated_by = (select auth.uid()), updated_at = now()
  where key = p_key;

  -- The old value is in the audit entry. A config change that cannot be read
  -- backwards is a change nobody can undo at 3am.
  perform public.audit(
    'config.set', 'app_config', null,
    jsonb_build_object('key', p_key, 'from', v_old, 'to', p_value)
  );
end;
$$;

revoke all on function public.admin_set_config(text, jsonb) from public, anon;
grant execute on function public.admin_set_config(text, jsonb) to authenticated;

-- ── 3. the fuse warning was sent every hour for twenty-four hours ─────────────
-- The job runs hourly and asks for every chat expiring within 24 hours.
-- fuses_expiring_within is a plain window query with no bookkeeping and the
-- route writes nothing back, so a member with a chat closing tomorrow got the
-- same warning twenty-four times. §8's whole posture is that a notification is
-- a rare, careful thing.
--
-- A narrower window alone would not fix it: a job that misses a tick would then
-- skip the warning entirely. Stamping is self-consuming and survives a missed
-- run.
alter table public.chats add column if not exists fuse_warned_at timestamptz;

comment on column public.chats.fuse_warned_at is
  'When the one-and-only fuse warning went out. Set by claim_fuse_warnings, which '
  'selects and stamps in one statement so a retry cannot double-send.';

create or replace function public.claim_fuse_warnings(p_hours integer)
returns table (chat_id uuid, member_id uuid, fuse_expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_not_end_user('claim_fuse_warnings');

  return query
  with due as (
    select c.id
    from public.chats c
    where c.status in ('open', 'date_planned')
      and c.fuse_expires_at is not null
      and c.fuse_warned_at is null
      and c.fuse_expires_at > now()
      and c.fuse_expires_at <= now() + make_interval(hours => p_hours)
    for update skip locked
  ),
  claimed as (
    -- Selecting and stamping in ONE statement is what makes this safe to retry:
    -- a second run finds nothing, because the first already took the rows.
    update public.chats c
       set fuse_warned_at = now()
      from due where c.id = due.id
    returning c.id, c.connect_id, c.fuse_expires_at
  )
  select claimed.id, m.member_id, claimed.fuse_expires_at
  from claimed
  join public.connects k on k.id = claimed.connect_id
  cross join lateral (values (k.initiator_id), (k.target_id)) as m(member_id);
end;
$$;

revoke all on function public.claim_fuse_warnings(integer) from public, anon, authenticated;

-- ── 4. one grant settled a conversion for both people ─────────────────────────
-- unrewarded_conversions excluded a conversion as soon as ANY premium_grants row
-- carried source = 'referral:<id>', with no user predicate — and the job pays the
-- invitee first. So the invitee's grant alone marked the conversion settled
-- forever, and a failure between the two payouts silently forfeited the
-- referrer's reward with no way to notice or replay it.
-- Dropped first. Adding a defaulted parameter does not replace a function, it
-- creates a SECOND one — and a three-argument call is then ambiguous, which is
-- an error rather than a fallback. check:referrals caught exactly that.
drop function if exists public.grant_referral_premium(uuid, uuid, integer);

create or replace function public.grant_referral_premium(
  p_conversion_id uuid,
  p_user_id uuid,
  p_days integer,
  p_role text default 'referrer'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_not_end_user('grant_referral_premium');

  if p_role not in ('referrer', 'invitee') then
    raise exception 'a referral grant is for the referrer or the invitee' using errcode = '22023';
  end if;

  insert into public.premium_grants (user_id, source, expires_at)
  values (
    p_user_id,
    -- The ROLE is part of the source now, so the two payouts settle
    -- independently and a half-finished conversion can be replayed.
    'referral:' || p_conversion_id::text || ':' || p_role,
    -- Stacks from the end of any premium they already hold, rather than from
    -- now. Granting from now would quietly shorten a reward for the members who
    -- earn them fastest.
    greatest(
      now(),
      coalesce((select max(expires_at) from public.premium_grants where user_id = p_user_id), now())
    ) + make_interval(days => p_days)
  )
  on conflict do nothing;
end;
$$;

revoke all on function public.grant_referral_premium(uuid, uuid, integer, text) from public, anon, authenticated;

-- Dropped rather than replaced: the return type gains referrer_paid and
-- invitee_paid, and CREATE OR REPLACE cannot change one.
drop function if exists public.unrewarded_conversions();

create function public.unrewarded_conversions()
returns table (
  conversion_id uuid,
  referrer_id uuid,
  invitee_id uuid,
  verified_at timestamptz,
  referrer_conversion_count bigint,
  referrer_paid boolean,
  invitee_paid boolean
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
    ),
    exists (
      select 1 from public.premium_grants g
      where g.source = 'referral:' || rc.id::text || ':referrer'
    ),
    exists (
      select 1 from public.premium_grants g
      where g.source = 'referral:' || rc.id::text || ':invitee'
    )
  from public.referral_conversions rc
  where rc.verified_at is not null
    -- Outstanding if EITHER side is still unpaid. The old form asked whether
    -- anybody had been paid at all.
    and not (
      exists (select 1 from public.premium_grants g
               where g.source = 'referral:' || rc.id::text || ':referrer')
      and exists (select 1 from public.premium_grants g
                   where g.source = 'referral:' || rc.id::text || ':invitee')
    )
  order by rc.verified_at asc;
$$;

revoke all on function public.unrewarded_conversions() from public, anon, authenticated;

-- ── 5. the tier-10 reward could be held and never decided ─────────────────────
-- Decision #25 and §6.5 require the 10-conversion reward to be approved or
-- denied by an administrator. The HOLD was implemented: the job records
-- referral_rewards with status 'pending_approval' and grants nothing. The
-- decision was not — referral_rewards had an owner-only SELECT policy and no
-- RPC, no admin screen and no write path of any kind, so every held reward sat
-- there permanently.
create or replace function public.admin_decide_referral_tier(
  p_reward_id uuid,
  p_approve boolean,
  p_grant_days integer default 180
)
returns public.reward_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_status public.reward_status;
  v_next public.reward_status;
begin
  if not public.is_admin() then
    raise exception 'not an administrator' using errcode = '42501';
  end if;

  select user_id, status into v_user, v_status
    from public.referral_rewards where id = p_reward_id;

  if v_user is null then
    raise exception 'no such reward' using errcode = 'P0002';
  end if;

  if v_status <> 'pending_approval' then
    raise exception 'that reward is already decided' using errcode = '22023';
  end if;

  v_next := case when p_approve then 'granted' else 'denied' end;

  update public.referral_rewards
     set status = v_next, decided_by = (select auth.uid()), decided_at = now()
   where id = p_reward_id;

  if p_approve then
    insert into public.premium_grants (user_id, source, expires_at)
    values (
      v_user,
      'referral_tier:' || p_reward_id::text,
      greatest(
        now(),
        coalesce((select max(expires_at) from public.premium_grants where user_id = v_user), now())
      ) + make_interval(days => p_grant_days)
    )
    on conflict do nothing;
  end if;

  perform public.audit('referral.tier.decide', 'referral_reward', p_reward_id,
    jsonb_build_object('approved', p_approve, 'days', p_grant_days));

  return v_next;
end;
$$;

revoke all on function public.admin_decide_referral_tier(uuid, boolean, integer) from public, anon;
grant execute on function public.admin_decide_referral_tier(uuid, boolean, integer) to authenticated;

create or replace function public.admin_pending_referral_tiers()
returns table (
  reward_id uuid,
  user_id uuid,
  display_name text,
  tier public.referral_tier,
  fraud_signals jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.user_id, p.display_name, r.tier, r.fraud_signals, r.created_at
  from public.referral_rewards r
  join public.profiles p on p.id = r.user_id
  where public.is_admin() and r.status = 'pending_approval'
  order by r.created_at asc;
$$;

revoke all on function public.admin_pending_referral_tiers() from public, anon;
grant execute on function public.admin_pending_referral_tiers() to authenticated;

-- ── the ON CONFLICT above had nothing to conflict with ────────────────────────
-- grant_referral_premium and admin_decide_referral_tier both say
-- `on conflict do nothing`, which is a no-op without a constraint. So a replayed
-- payout — a cron retry, a job that crashed between the two sides, an admin
-- pressing approve twice — stacked a SECOND grant on top of the first and
-- silently doubled somebody's premium. check:referrals caught it.
--
-- The source string is already unique per reason: 'referral:<conversion>:<role>'
-- and 'referral_tier:<reward>'. Making that a promise rather than a convention
-- is what makes every one of those writes idempotent.
create unique index if not exists premium_grants_user_source_uix
  on public.premium_grants (user_id, source);
