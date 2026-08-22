-- profiles.timezone is read in four places and written in none.
--
-- Every profile in the database is 'UTC', which is the column default, because
-- nothing has ever set it. The consequences are quiet and everywhere:
--
--   · every timestamp in a chat, a room and the inbox is rendered in UTC. A
--     message sent at 22:30 says 22:30 to nobody — chats/[id]/page.tsx has a
--     comment promising exactly that behaviour and it has never been true.
--   · the drop lands at 20:00 UTC for everyone. 20260821000200 made the hour
--     real and 20260821000400 built a sweep to announce it, and both are
--     nominal: for a member in New York the "8pm" drop arrives at four in the
--     afternoon, and in Sydney at five in the morning.
--
-- Members already hold update on the column, so this is not about permission.
-- It is about validation and about something actually calling it.
create or replace function public.set_my_timezone(p_timezone text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- Checked against Postgres's own list rather than a regex.
  --
  -- The value comes from Intl.DateTimeFormat().resolvedOptions().timeZone in a
  -- browser, which is trustworthy right up until it is not: an extension can
  -- change it, and a spoofed one is a free-text write to a column every
  -- date-formatting call in the app reads. `local_now` falls back on a bad
  -- zone rather than raising, so a garbage value would not break anything
  -- loudly — it would silently put a member back on UTC while the row claimed
  -- otherwise, which is worse.
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'not a timezone' using errcode = '22023';
  end if;

  update public.profiles
     set timezone = p_timezone
   where id = v_uid
     -- Only when it changed. The client reports on every load, and a write per
     -- page view on the row every wall reads is a cost for nothing.
     and timezone is distinct from p_timezone;
end;
$$;

revoke all on function public.set_my_timezone(text) from public, anon;
grant execute on function public.set_my_timezone(text) to authenticated;

comment on function public.set_my_timezone(text) is
  'Records the caller''s IANA timezone, validated against pg_timezone_names. Written from the browser on load; every date the app renders and the hour the drop lands both read it.';
