-- The connect budget was optional, and the clock belonged to the client.
--
-- Three holes on one insert path, all verified against the live database as an
-- ordinary member:
--
--   · `source` arrives from the client and 'drop' costs nothing, with nothing
--     checking that a drop ever happened. Eight connects went out on a 3/day
--     tier with connect_budgets still reading zero. Decision #15 exempts
--     drop-card connects to nudge toward curation; it does not exempt the word.
--   · created_at is settable, so a support-only member could backdate out of
--     the weekly window the trigger counts (`created_at >= week_start`).
--   · expires_at is settable, so a pending ask could be given a hundred years —
--     and a connect that never expires never sends the §6.2 note, which makes
--     it the one way to end something in silence.
--
-- A column DEFAULT only applies when the column is omitted, and `connects`
-- carries a direct INSERT grant. The policy pinned initiator_id and status and
-- said nothing about the rest.
--
-- In this community the first one is a safety question rather than a billing
-- one: an unlimited budget is unlimited unsolicited approaches to every member
-- a person can see.

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
  -- The clock is ours. `connects` carries a direct INSERT grant, and the policy
  -- pins initiator_id and status but said nothing about these two — so a member
  -- could backdate created_at out of the support-only weekly window, and set
  -- expires_at a hundred years out for a pending ask that never expires and
  -- never sends the §6.2 note. Defaults only apply when a column is omitted.
  new.created_at := now();
  new.expires_at := now() + make_interval(days => public.config_int('connects.pending_expiry_days', 7));

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
    -- Decision #15: drop-card connects do not consume the daily budget, which
    -- nudges toward curation. Nothing checked that a drop had ever happened,
    -- and `source` arrives from the client — so claiming 'drop' bought an
    -- unlimited budget. Verified: eight connects sent on a 3/day tier with the
    -- counter still reading zero.
    --
    -- The exemption is for a card we chose to show you, so it is spent per
    -- person rather than per send: a second approach to someone already served
    -- costs from the daily budget like any other. Curation is the first reply,
    -- not an allowance attached to a name.
    v_cost := case
      when new.source = 'drop'
        and exists (
          select 1 from public.drops d
          where d.user_id = new.initiator_id
            and new.target_id = any (d.served_profile_ids)
        )
        and not exists (
          select 1 from public.connects prior
          where prior.initiator_id = new.initiator_id
            and prior.target_id = new.target_id
        )
      then 0
      else 1
    end;

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
