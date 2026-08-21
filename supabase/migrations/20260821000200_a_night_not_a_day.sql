-- A drop night runs from 20:00, and the date guard was sized for a calendar day.
--
-- DROP.hourLocal has declared 20:00 since Milestone 1 and nothing read it: a
-- drop was keyed on the member's local CALENDAR date, so it arrived whenever
-- they first opened the app that day — 00:01, or on the way to work. "Three a
-- night" was three a day. The app now keys a drop on the NIGHT, which runs from
-- the hour rather than from midnight, so before 20:00 local the key is the
-- previous local date.
--
-- That breaks this guard. It allows a day either side of UTC today, which was
-- exactly enough when the key could only differ from UTC by a timezone offset.
-- It can now differ by the offset AND the shift back across the hour:
--
--   a member at UTC-11, at 19:00 local on the 21st, is at 06:00 UTC on the 22nd
--   and their drop night is the 20th — two days behind UTC today.
--
-- record_drop would have raised 'a drop is for today', the insert would never
-- have happened, and because a stored row is what makes a drop stable, every
-- page load would have built them a fresh one. A different three every time
-- they blinked, for everybody in Hawaii, Samoa, Niue and the Cooks.
--
-- Two days either side. The bound exists to stop a member writing a drop for an
-- arbitrary date, and ±2 is the widest a legitimate key can now be: 14 hours of
-- timezone is under a day, plus one for the night shift.
create or replace function public.record_drop(
  p_drop_date date,
  p_served_profile_ids uuid[],
  p_radius_used_mi integer,
  p_is_preview boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_max integer := public.config_int('drop.count', 3);
  v_today date := (now() at time zone 'utc')::date;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- Two days either side of UTC today. See the note above: a drop night can be
  -- a timezone offset AND one night behind the UTC date.
  if p_drop_date > v_today + 1 or p_drop_date < v_today - 2 then
    raise exception 'a drop is for today' using errcode = '22023';
  end if;

  if coalesce(array_length(p_served_profile_ids, 1), 0) > v_max then
    raise exception 'a drop is at most % cards', v_max using errcode = '22023';
  end if;

  -- Unchanged, and the reason it exists is unchanged: record_drop is SECURITY
  -- DEFINER and takes the id array from the caller, and enforce_connect_rules
  -- grants Decision #15's zero-cost connect on "is this target in my drops
  -- row". Without this, a member could post an array of everyone they wanted
  -- and manufacture unlimited free connects.
  if exists (
    select 1
    from unnest(coalesce(p_served_profile_ids, array[]::uuid[])) as t(id)
    where not exists (select 1 from public.visible_profiles v where v.id = t.id)
  ) then
    raise exception 'a drop card must be someone you can see' using errcode = '42501';
  end if;

  insert into public.drops (user_id, drop_date, served_profile_ids, radius_used_mi, is_preview)
  values (v_uid, p_drop_date, p_served_profile_ids, p_radius_used_mi, p_is_preview)
  on conflict (user_id, drop_date) do nothing;
end;
$$;

revoke all on function public.record_drop(date, uuid[], integer, boolean) from public, anon;
grant execute on function public.record_drop(date, uuid[], integer, boolean) to authenticated;
