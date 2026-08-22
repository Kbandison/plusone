-- The events that had a template and no trigger.
--
-- 20260821000800 built the place a member can look, the switches, and the
-- dispatcher. What it did not build is the half of the matrix that nothing in
-- the app has ever fired: §8 names a connect expiring, a chat closing, premium
-- ending and new members nearby, and every one of them was a string in a
-- config file with no code path leading to it.
--
-- That matters more now than it did yesterday. Yesterday they were unreachable
-- templates; today each one is about to become a SWITCH on a settings screen,
-- and a switch for something that can never happen is worse than no switch —
-- it is a promise printed on the control panel.
--
-- Everything here follows claim_fuse_warnings: select and stamp in ONE
-- statement, so a job that runs every fifteen minutes is self-consuming and a
-- retry finds nothing. The alternative — query, send, then stamp — is how the
-- fuse warning sent the same warning twenty-four times.

-- ── the list has to arrive on its own ────────────────────────────────────────
--
-- The bell in the header is a count, and a count that only changes when you
-- navigate is a count that is wrong for as long as you stay still. This is the
-- fourth table on the stream and the least sensitive of them: a notification
-- row is an event name and two uuids, no text at all, and "members read their
-- own notifications" scopes it to one person — Realtime evaluates that policy
-- per subscriber, so nobody is told about anybody else's.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- ── a connect that is about to run out ───────────────────────────────────────
--
-- §6.3 expires an unanswered connect after seven days. sweep_expired_connects
-- has always done that and nothing has ever said it was coming, which makes a
-- deadline indistinguishable from a deletion: the member who was asked simply
-- finds the row gone, and the member who asked never learns whether it was
-- read.
alter table public.connects
  add column if not exists expiry_warned_at timestamptz;

comment on column public.connects.expiry_warned_at is
  'When the target was told this is about to expire. Stamped at claim time so the hourly sweep is self-consuming.';

create index if not exists connects_expiry_warning_ix
  on public.connects (expires_at)
  where status = 'pending' and expiry_warned_at is null;

create or replace function public.claim_connect_expiry_warnings(p_hours integer)
returns table (connect_id uuid, target_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_not_end_user('claim_connect_expiry_warnings');

  return query
  with due as (
    select k.id
      from public.connects k
     where k.status = 'pending'
       and k.expiry_warned_at is null
       and k.expires_at > now()
       and k.expires_at <= now() + make_interval(hours => p_hours)
    for update skip locked
  ),
  claimed as (
    update public.connects k
       set expiry_warned_at = now()
      from due where k.id = due.id
    returning k.id, k.target_id
  )
  select claimed.id, claimed.target_id from claimed;
end;
$$;

revoke all on function public.claim_connect_expiry_warnings(integer) from public, anon, authenticated;

-- Only the person who was ASKED. "A connect is waiting on you" is true of one
-- of the two, and telling the sender their connect is about to expire is
-- telling them the other person has not answered — which is a piece of
-- information about somebody else's behaviour that nobody asked to broadcast,
-- and which they can do nothing about.
comment on function public.claim_connect_expiry_warnings(integer) is
  'Pending connects inside the warning window, stamped as it selects them. Returns the target only: the sender cannot act on it and does not need to know they were not answered yet.';

-- ── a chat that has closed ───────────────────────────────────────────────────
--
-- §3.5 makes the closing note the point: a chat here never just stops, it ends
-- with something written. And until now nobody was told it had ended, so the
-- note sat in a thread the member had no reason to reopen.
alter table public.chats
  add column if not exists closed_notified_at timestamptz;

comment on column public.chats.closed_notified_at is
  'When the participants were told this closed. Separate from closed_at because a chat can close by fuse, by a person, or by a block, and only two of those are told.';

create index if not exists chats_closed_notice_ix
  on public.chats (closed_at)
  where closed_notified_at is null;

create or replace function public.claim_chat_closed_notices()
returns table (chat_id uuid, member_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_not_end_user('claim_chat_closed_notices');

  return query
  with due as (
    select c.id
      from public.chats c
     where c.closed_at is not null
       and c.closed_notified_at is null
       and c.status in ('closed_fuse', 'closed_by_member')
       -- Never a block. close_chats_on_block ends the thread for both people
       -- and stamps blocked_at, and a notification there tells the blocked
       -- member that something happened at the exact moment the product's job
       -- is to make them disappear from each other quietly.
       and c.blocked_at is null
    for update skip locked
  ),
  claimed as (
    update public.chats c
       set closed_notified_at = now()
      from due where c.id = due.id
    returning c.id, c.connect_id, c.closed_by
  )
  select claimed.id, m.member_id
    from claimed
    join public.connects k on k.id = claimed.connect_id
    cross join lateral (values (k.initiator_id), (k.target_id)) as m(member_id)
   -- Not the person who closed it. They know; they wrote the note.
   -- closed_by is null on a fuse expiry, which is the case where both are told
   -- because neither of them decided it.
   where claimed.closed_by is null or m.member_id <> claimed.closed_by;
end;
$$;

revoke all on function public.claim_chat_closed_notices() from public, anon, authenticated;

comment on function public.claim_chat_closed_notices() is
  'Chats that closed and have not been announced, one row per participant who did not close it. Excludes blocks: a block is supposed to be quiet.';

-- ── premium about to lapse ───────────────────────────────────────────────────
--
-- The one event in §8 that costs the member money to ignore, and the only one
-- whose default channel is email — a lapse is a thing to deal with rather than
-- a moment to look at, and §8 gives every email one subject with the content
-- behind the login, so it adds a line in an inbox and nothing else.
alter table public.subscriptions
  add column if not exists expiry_warned_for timestamptz;

-- The PERIOD warned about, not the time of warning. A renewal moves
-- current_period_end forward, and a plain "already warned" stamp would silence
-- every renewal after the first — the member would be told once, in year one,
-- and never again.
comment on column public.subscriptions.expiry_warned_for is
  'The current_period_end that has already been warned about. Compared rather than merely present, so each renewed period gets its own warning.';

create or replace function public.claim_premium_expiry_warnings(p_days integer)
returns table (user_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_not_end_user('claim_premium_expiry_warnings');

  return query
  with due as (
    select s.user_id as uid
      from public.subscriptions s
     where s.status = 'active'
       and s.current_period_end is not null
       and s.current_period_end > now()
       and s.current_period_end <= now() + make_interval(days => p_days)
       and s.expiry_warned_for is distinct from s.current_period_end
    for update skip locked
  ),
  claimed as (
    update public.subscriptions s
       set expiry_warned_for = s.current_period_end
      from due where s.user_id = due.uid
    returning s.user_id
  )
  select claimed.user_id from claimed;
end;
$$;

revoke all on function public.claim_premium_expiry_warnings(integer) from public, anon, authenticated;

comment on function public.claim_premium_expiry_warnings(integer) is
  'Active subscriptions whose current period ends inside the window and has not been warned about. Stamps the period end, so the next renewal warns again.';

-- ── new people nearby ────────────────────────────────────────────────────────
--
-- The only event in §8 that is not about something that happened TO the
-- member, which is why it is in-app only by default and why it is weekly. A
-- push saying "come back, there are new people" is the engagement loop §3.3
-- bans; a line in a list the member opens on their own terms is not.
alter table public.profiles
  add column if not exists nearby_notified_at timestamptz;

comment on column public.profiles.nearby_notified_at is
  'When this member was last told about new arrivals near them. Weekly at most, and only ever in-app by default.';

create or replace function public.claim_nearby_joins(
  p_days integer default 7,
  p_min integer default 5
)
returns table (user_id uuid, joined integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_not_end_user('claim_nearby_joins');

  return query
  with viewer as (
    select p.id, p.location, p.search_radius_mi
      from public.profiles p
     where p.mode = 'dating'
       and p.verification_status = 'verified'
       and p.location is not null
       and (p.nearby_notified_at is null or p.nearby_notified_at <= now() - make_interval(days => p_days))
  ),
  counted as (
    select v.id,
           (
             select count(*)
               from public.profiles n
              where n.id <> v.id
                and n.onboarded_at is not null
                and n.onboarded_at >= now() - make_interval(days => p_days)
                and n.location is not null
                -- Distance first: it is the index-backed predicate, and
                -- can_view_profile is six joins of walls that do not need
                -- evaluating for somebody four states away.
                and extensions.ST_DWithin(
                      n.location,
                      v.location,
                      coalesce(v.search_radius_mi, 50) * 1609.344
                    )
                -- Counting people the member cannot see would make the number
                -- a lie — and worse, a lie that leaks. The same wall the drop
                -- and browse are built on: community, mode, blocks,
                -- verification, all of it.
                and public.can_view_profile(v.id, n.id, n.community, n.cross_community_opt_in, n.mode, n.verification_status)
           )::integer as joined
      from viewer v
  ),
  due as (
    -- §8: "count granularity < 5". Below the floor there is no notification at
    -- all — in a thin local pool "1 new member joined near you" plus a browse
    -- screen is a name, which is exactly the inference the floor exists to stop.
    select c.id, c.joined from counted c where c.joined >= p_min
  ),
  claimed as (
    update public.profiles p
       set nearby_notified_at = now()
      from due where p.id = due.id
    returning p.id
  )
  select claimed.id, due.joined
    from claimed join due on due.id = claimed.id;
end;
$$;

revoke all on function public.claim_nearby_joins(integer, integer) from public, anon, authenticated;

comment on function public.claim_nearby_joins(integer, integer) is
  'Members with at least p_min new arrivals they can actually see inside their own radius, stamped as it selects them. Below the floor nobody is told, because a small count on a small pool names a person.';

-- ── where a notification actually goes ───────────────────────────────────────
--
-- Every event had a path in NOTIFICATIONS and all of them are page-level:
-- /app/inbox, /app/rooms. That is the right answer for a PUSH, where the URL
-- is visible on a lock screen and must not identify anything. It is the wrong
-- answer in the list, where "someone replied to you" lands the member on the
-- room index to go and find which post it was.
--
-- So the path is RESOLVED here, from the references, at read time — the same
-- reason the row stores no sentence. It is a left join under security invoker,
-- which means a post since deleted, a room the member has left, or a chat they
-- can no longer read all produce null rather than a link into a wall. The app
-- falls back to the event's page-level path, which is always safe.
drop function if exists public.my_notifications(integer);

create or replace function public.my_notifications(p_limit integer default 50)
returns table (
  id uuid,
  event text,
  actor_name text,
  subject_id uuid,
  subject_path text,
  created_at timestamptz,
  read_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    n.id,
    n.event,
    v.display_name,
    n.subject_id,
    case
      when n.event in ('like_received', 'reply_received') then (
        select '/app/rooms/' || m.room_id::text || '/' || m.id::text
          from public.room_messages m
         where m.id = n.subject_id and m.deleted_at is null
      )
      when n.event in ('message_received', 'chat_closed', 'plan_proposed', 'plan_confirmed') then (
        select '/app/chats/' || c.id::text
          from public.chats c
         where c.id = n.subject_id
      )
    end,
    n.created_at,
    n.read_at
  from public.notifications n
  left join public.visible_profiles v on v.id = n.actor_id
  where n.user_id = (select auth.uid())
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

grant execute on function public.my_notifications(integer) to authenticated;

comment on function public.my_notifications(integer) is
  'The caller''s notifications, newest first, with the actor AND the destination resolved at read time — so somebody since blocked has no name, and a post since deleted has no link, rather than either being stale.';

-- ── an unread count, without reading the list ────────────────────────────────
--
-- The bell is on every screen in the app, and rendering it through
-- my_notifications would fetch fifty rows and their joins on every page load to
-- produce one integer.
create or replace function public.my_unread_notifications()
returns integer
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select count(*)::integer
    from public.notifications n
   where n.user_id = (select auth.uid()) and n.read_at is null;
$$;

grant execute on function public.my_unread_notifications() to authenticated;

comment on function public.my_unread_notifications() is
  'How many are unread, for the bell. security invoker: the same policy that guards the list guards the count.';
