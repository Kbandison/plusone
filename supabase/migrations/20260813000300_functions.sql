-- Plus One — helper functions, walls, and enforcement triggers
--
-- Every SECURITY DEFINER function pins search_path. Without it, a caller can
-- shadow `public` and hijack the function's resolution.
--
-- The visibility wall lives in ONE function, can_view_profile(), which is used by
-- BOTH the profiles RLS policy and the visible_profiles view. A client bug cannot
-- route around it, and there is no second copy to drift.

-- ── config ────────────────────────────────────────────────────────────────────
-- Admin config editor (§7.3) overrides the packaged defaults in packages/config.
create or replace function public.config_int(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select (value #>> '{}')::integer from public.app_config where key = p_key), p_default);
$$;

-- ── generic ───────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.age_from_birthdate(p_birthdate date)
returns integer
language sql
immutable
as $$
  select extract(year from age(current_date, p_birthdate))::integer;
$$;

-- ── location (§5.3.6) ─────────────────────────────────────────────────────────
-- Rounded to 2 decimal places (~1.1km) at write time. The precise value never
-- enters the database, so it cannot leak from it.
create or replace function public.round_location(p_location extensions.geography)
returns extensions.geography
language sql
immutable
as $$
  select case
    when p_location is null then null
    else extensions.ST_SetSRID(
      extensions.ST_MakePoint(
        round(extensions.ST_X(p_location::extensions.geometry)::numeric, 2)::double precision,
        round(extensions.ST_Y(p_location::extensions.geometry)::numeric, 2)::double precision
      ),
      4326
    )::extensions.geography
  end;
$$;

create or replace function public.round_profile_location()
returns trigger
language plpgsql
as $$
begin
  new.location = public.round_location(new.location);
  return new;
end;
$$;

-- Whole miles. Used for dating cards, where "12 miles" is the honest number.
create or replace function public.distance_mi(
  a extensions.geography,
  b extensions.geography
)
returns integer
language sql
stable
as $$
  select case
    when a is null or b is null then null
    else greatest(1, round((extensions.ST_Distance(a, b) / 1609.344)::numeric)::integer)
  end;
$$;

-- Coarse bucket for Preview Drop cards, where the viewer is shielded and the
-- subject has not consented to being precisely located by them (Decision #19).
create or replace function public.distance_bucket_mi(
  a extensions.geography,
  b extensions.geography
)
returns integer
language sql
stable
as $$
  select case
    when d is null then null
    when d <= 5 then 5
    when d <= 10 then 10
    when d <= 25 then 25
    when d <= 50 then 50
    when d <= 100 then 100
    when d <= 150 then 150
    else 250
  end
  from (select public.distance_mi(a, b) as d) s;
$$;

-- ── identity ──────────────────────────────────────────────────────────────────
create or replace function public.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.admin_users where user_id = p_user_id);
$$;

-- Premium truth = an active subscription UNION an unexpired grant (§5.2).
-- Referral rewards therefore confer premium without ever touching matching.
create or replace function public.is_premium(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1 from public.subscriptions s
      where s.user_id = p_user_id
        and s.status in ('active', 'trialing')
        and (s.current_period_end is null or s.current_period_end > now())
    )
    or exists (
      select 1 from public.premium_grants g
      where g.user_id = p_user_id and g.expires_at > now()
    );
$$;

-- Reads a member's mode WITHOUT going through RLS.
--
-- This exists because a policy that reads public.profiles directly is itself
-- RLS-filtered, and that inverts negative tests: a dating-mode member cannot SEE
-- a support-only profile, so `not exists (... t.mode = 'support_only')` would be
-- vacuously TRUE and the mode wall would pass exactly when it must fail.
create or replace function public.profile_mode(p_user_id uuid)
returns public.member_mode
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select mode from public.profiles where id = p_user_id;
$$;

create or replace function public.is_blocked_either_way(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

create or replace function public.shares_room(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.room_members ma
    join public.room_members mb on mb.room_id = ma.room_id
    where ma.user_id = a and mb.user_id = b
  );
$$;

create or replace function public.is_member_of_room(p_user_id uuid, p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.room_members
    where user_id = p_user_id and room_id = p_room_id
  );
$$;

-- ── THE WALL (§5.3.2) ─────────────────────────────────────────────────────────
-- Community wall + mode wall + block list + verified-only, evaluated in SQL.
--
-- SECURITY DEFINER so it can read the viewer's own profile row without tripping
-- the very RLS policy it is used by.
create or replace function public.can_view_profile(
  p_viewer_id uuid,
  p_target_id uuid,
  p_target_community public.condition_community,
  p_target_cross_opt_in boolean,
  p_target_mode public.member_mode,
  p_target_verification public.verification_status
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p_viewer_id is not null
    -- Verified-only. Unverified profiles are invisible to everyone.
    and p_target_verification = 'verified'
    and not public.is_blocked_either_way(p_viewer_id, p_target_id)
    and exists (
      select 1
      from public.profiles v
      where v.id = p_viewer_id
        and v.verification_status = 'verified'
        -- Community wall: same community, or BOTH sides opted in (Decision #5).
        and (
          v.community = p_target_community
          or (v.cross_community_opt_in and p_target_cross_opt_in)
        )
        -- Mode wall: a support-only profile is invisible to a dating-mode viewer.
        -- Zero exceptions, including paid ones (Decision #17). Support-only members
        -- remain visible to each other so they can reach out (Decision #18).
        and (
          p_target_mode = 'dating'
          or v.mode = 'support_only'
        )
    );
$$;

comment on function public.can_view_profile is
  'Single source of truth for profile visibility. Used by both the profiles RLS policy and the visible_profiles view. Never inline this logic anywhere else.';

-- ── connect enforcement (§5.3.3, §6.3) ────────────────────────────────────────
-- Runs on every insert regardless of path, so the walls and budgets hold even if
-- a client is somehow granted direct table access.
create or replace function public.enforce_connect_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_initiator public.profiles%rowtype;
  v_target public.profiles%rowtype;
  v_cost smallint;
  v_used smallint;
  v_limit integer;
  v_week_start date;
  v_week_used integer;
begin
  select * into v_initiator from public.profiles where id = new.initiator_id;
  select * into v_target from public.profiles where id = new.target_id;

  if v_initiator.id is null or v_target.id is null then
    raise exception 'connect: profile not found' using errcode = 'P0002';
  end if;

  if v_initiator.verification_status <> 'verified' then
    raise exception 'connect: initiator is not verified' using errcode = 'P0001';
  end if;

  -- THE HARD WALL. Nobody in dating mode may initiate toward a support-only
  -- member. This is not purchasable and has no exemption path (Decision #17).
  if v_initiator.mode = 'dating' and v_target.mode = 'support_only' then
    raise exception 'connect: target is support-only' using errcode = 'P0001';
  end if;

  -- Support-only outbound is room-scoped only (Decision #18). Agency stays with
  -- the shielded person; nothing reaches in.
  if v_initiator.mode = 'support_only' and v_target.mode = 'dating' then
    if new.room_id is null then
      raise exception 'connect: support-only outbound requires a shared room'
        using errcode = 'P0001';
    end if;
    if not public.is_member_of_room(new.initiator_id, new.room_id)
       or not public.is_member_of_room(new.target_id, new.room_id) then
      raise exception 'connect: both members must belong to the room'
        using errcode = 'P0001';
    end if;
  end if;

  -- Visibility wall applies to initiation as well as to reading.
  if not public.can_view_profile(
       new.initiator_id, v_target.id, v_target.community,
       v_target.cross_community_opt_in, v_target.mode, v_target.verification_status
     ) then
    raise exception 'connect: target is not visible to initiator' using errcode = 'P0001';
  end if;

  -- ── budgets ────────────────────────────────────────────────────────────────
  if v_initiator.mode = 'support_only' then
    -- 3 per week, counted directly off connects so it can never drift.
    v_week_start := date_trunc('week', now())::date;
    select count(*) into v_week_used
    from public.connects
    where initiator_id = new.initiator_id
      and created_at >= v_week_start;

    v_limit := public.config_int('connects.support_only_per_week', 3);
    if v_week_used >= v_limit then
      raise exception 'connect: weekly support budget exhausted' using errcode = 'P0001';
    end if;
  else
    -- Drop-card connects cost nothing — this nudges toward curation (Decision #15).
    v_cost := case when new.source = 'drop' then 0 else 1 end;

    if v_cost > 0 then
      v_limit := case
        when public.is_premium(new.initiator_id)
          then public.config_int('connects.premium_per_day', 10)
        else public.config_int('connects.free_per_day', 3)
      end;

      insert into public.connect_budgets (user_id, day, connects_used)
      values (new.initiator_id, current_date, 0)
      on conflict (user_id, day) do nothing;

      select connects_used into v_used
      from public.connect_budgets
      where user_id = new.initiator_id and day = current_date
      for update;

      if v_used + v_cost > v_limit then
        raise exception 'connect: daily budget exhausted' using errcode = 'P0001';
      end if;

      update public.connect_budgets
      set connects_used = connects_used + v_cost
      where user_id = new.initiator_id and day = current_date;
    end if;
  end if;

  return new;
end;
$$;

-- ── triggers ──────────────────────────────────────────────────────────────────
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger profiles_round_location
  before insert or update of location on public.profiles
  for each row execute function public.round_profile_location();

create trigger quiz_responses_set_updated_at
  before update on public.quiz_responses
  for each row execute function public.set_updated_at();

create trigger chats_set_updated_at
  before update on public.chats
  for each row execute function public.set_updated_at();

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create trigger connects_enforce_rules
  before insert on public.connects
  for each row execute function public.enforce_connect_rules();
