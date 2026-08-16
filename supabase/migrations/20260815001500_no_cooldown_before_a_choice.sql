-- The intention cooldown started before the intention did.
--
-- `intention_changed_at` is `not null default now()`, so every profile created
-- at signup carries a thirty-day clock for a choice its owner has never made.
-- Onboarding's intention step sets the first one through change_intention, and
-- change_intention refused it: "intention can change again on <thirty days>".
--
-- So step 6 of 9 could not be completed by anyone, and the app said "That
-- didn't save."
--
-- I introduced the reachable half of this earlier today, moving the onboarding
-- write off a direct column update and onto the RPC — correct, because the
-- columns are no longer member-writable and a cooldown enforced only in an RPC
-- while the column stays writable is not a cooldown. But change_intention had
-- only ever been asked to CHANGE an intention, never to set the first one.

create or replace function public.change_intention(p_intention public.intention)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
  v_cooldown integer := public.config_int('cooldowns.intention_change_days', 30);
begin
  select * into v_profile from public.profiles where id = v_caller for update;

  if v_profile.id is null then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  if v_profile.intention = p_intention then
    return;
  end if;

  -- "You can change this once every 30 days, so it means something."
  --
  -- Only once there IS one. intention_changed_at is `not null default now()`,
  -- so a profile created at signup carries a clock for a choice its owner has
  -- never made — and the onboarding step, which sets the first intention
  -- through this function, was refused with "intention can change again on"
  -- a date thirty days out. Nobody could finish onboarding.
  --
  -- A member is not on a cooldown for a decision they have not taken. The clock
  -- still starts at the first choice, which is what makes it the same clock for
  -- everybody rather than one that starts whenever someone first edits.
  if v_profile.intention is not null
     and now() < v_profile.intention_changed_at + make_interval(days => v_cooldown) then
    raise exception 'intention can change again on %',
      to_char(v_profile.intention_changed_at + make_interval(days => v_cooldown), 'YYYY-MM-DD')
      using errcode = 'P0001';
  end if;

  update public.profiles
  set intention = p_intention, intention_changed_at = now()
  where id = v_caller;

  perform public.audit('profile.intention_changed', 'profile', v_caller,
    jsonb_build_object('intention', p_intention));
end;
$$;
