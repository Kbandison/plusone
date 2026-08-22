-- The drop lands at 20:00 and nothing tells anybody.
--
-- 20260821000200 made the hour real: a night runs 20:00 to 20:00 rather than
-- midnight to midnight. That is the product's rhythm — it is why there is no
-- infinite feed here — and a nightly moment nobody is told about is a nightly
-- moment that does not happen. Whoever happens to open the app at nine gets it;
-- everybody else finds three cards from four nights ago.
--
-- Three pieces: somewhere to record that a member was told, a safe way to ask
-- what time it is where they are, and a CLAIM that hands out each night once.

-- ── what time is it where they are ───────────────────────────────────────────
--
-- `now() at time zone p.timezone` RAISES on a zone Postgres does not recognise,
-- and profiles.timezone is a text column filled from a browser. One member with
-- a stale or mangled zone would abort the whole claim and nobody would be told
-- anything — so the failure is caught per row and falls back to UTC, which is
-- the same thing the app's own localDate does and for the same reason.
create or replace function public.local_now(p_timezone text)
returns timestamp
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  return now() at time zone coalesce(nullif(trim(p_timezone), ''), 'UTC');
exception
  when others then
    return now() at time zone 'UTC';
end;
$$;

comment on function public.local_now(text) is
  'The current local time in a member''s timezone, falling back to UTC rather than raising on an unrecognised zone — profiles.timezone is filled from a browser and one bad value must not abort a sweep.';

-- ── somewhere to record that they were told ──────────────────────────────────
--
-- On profiles rather than on drops, and that is the whole design problem.
--
-- A drops row is written by record_drop when a member OPENS the app, so there
-- is no row for the people this notification exists to reach. Marking the drop
-- would only ever mark the members who did not need telling.
--
-- The night, not a timestamp. "Was this member told about the night of the
-- 21st" is the question, and a date answers it exactly once however many times
-- the sweep runs.
alter table public.profiles add column if not exists drop_notified_night date;

-- Not added to any member grant, deliberately. 20260815000800 made the columns
-- the wall: members hold column-scoped select and update on profiles, so a new
-- column is unreachable to them by default. That is the safe direction and it
-- is where this belongs — a member who could write this could silence their own
-- notification or replay it.

-- ── the claim ────────────────────────────────────────────────────────────────
--
-- Selects and stamps in one statement, so it is self-consuming: a second run
-- inside the same night finds nothing. The fuse warning learned this the hard
-- way — it queried without writing back and sent the same warning twenty-four
-- times.
create or replace function public.claim_drop_notifications(p_hour integer default 20)
returns table (user_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with candidate as (
    select
      p.id,
      -- The night this member is currently in. Before the hour they are still
      -- in yesterday's, which is what dropNightDate does in TypeScript and the
      -- two must agree or a notification names a different drop from the one
      -- the app then shows.
      case
        when extract(hour from public.local_now(p.timezone)) < p_hour
          then (public.local_now(p.timezone))::date - 1
        else (public.local_now(p.timezone))::date
      end as night,
      extract(hour from public.local_now(p.timezone)) as local_hour
    from public.profiles p
    where p.onboarded_at is not null
      -- Dating mode only.
      --
      -- A support-only member gets a Preview Drop, and §3.3 bans engagement
      -- bait. A nightly push at somebody who chose the shield, whose only call
      -- to action is "switch to dating to see and connect", is a nightly nudge
      -- to give up the shield. They can still open the app.
      and p.mode = 'dating'
      -- No point claiming somebody we cannot reach. Also keeps the marker
      -- honest: it means "was told", not "would have been told".
      and exists (select 1 from public.push_subscriptions s where s.user_id = p.id)
  ),
  due as (
    select c.id, c.night
    from candidate c
    -- Both conditions are needed and neither is redundant.
    --
    -- The night comparison alone would notify a brand-new member at ten in the
    -- morning, because their marker is null and their current night is
    -- yesterday's. The hour alone would notify them again every run until
    -- midnight.
    where c.local_hour >= p_hour
      and (
        select p.drop_notified_night from public.profiles p where p.id = c.id
      ) is distinct from c.night
  ),
  claimed as (
    update public.profiles p
       set drop_notified_night = due.night
      from due
     where p.id = due.id
    returning p.id
  )
  select claimed.id from claimed;
end;
$$;

revoke all on function public.claim_drop_notifications(integer) from public, anon, authenticated;

comment on function public.claim_drop_notifications(integer) is
  'Members whose local clock has passed the drop hour and who have not been told about tonight''s drop, stamped as told in the same statement. Service role only; self-consuming, so an hourly sweep cannot notify twice.';
