-- "Who's active near you" (PREMIUM_INCLUDES, server 18c) as a saved alert.
--
-- The line has been on /pricing and the premium settings screen since the tier
-- existed, and the string appeared nowhere else in the repo. What made it hard
-- is not the query; it is that the obvious build is banned twice over:
--
--   · §8 forbids identity and forbids count granularity below five, so this can
--     never say "Sam is active" and can never say "2 people are".
--   · §3.3 bans the engagement loop, and claim_nearby_joins says so about this
--     exact sentence: "a push saying 'come back, there are new people' is the
--     engagement loop §3.3 bans".
--
-- And since 3fc2212 gave Browse a free day/week/month activity ladder, a
-- premium LIST of active people would have been /app/browse?activity=day behind
-- a paywall, which is selling somebody something they already have.
--
-- So it is an alert the member builds and owns: a radius they pick, off until
-- they create it, deleted in one press, in-app until they ask for push. §3.3
-- bans the app nudging the member; it does not ban the member asking to be
-- told. That distinction is the whole reason this belongs on a tier whose
-- stated line (Decision #23/#24) is reach and control.
create table public.activity_alerts (
  user_id uuid primary key references auth.users (id) on delete cascade,

  -- Bounded here rather than only in the form, because a radius arrives from a
  -- client. The numbers are RADIUS.minMi, .maxMi and .defaultMi from
  -- mechanics.ts rather than new ones — this app already has a vocabulary for
  -- how far away "near you" reaches, and a second set of bounds that happened
  -- to disagree would be a constraint nobody could explain.
  radius_mi integer not null default 50
    check (radius_mi between 5 and 250),

  -- Kept rather than deleting the row, so a member who switches it off for a
  -- fortnight gets their radius back instead of setting it again.
  enabled boolean not null default true,

  -- The cooldown, and the reason it is not a member-writable column: the grant
  -- below withholds it. A member who could stamp this could clear their own
  -- cooldown, and the cooldown is what stops a paid feature becoming the
  -- nightly nag §3.3 refuses.
  notified_at timestamptz,

  created_at timestamptz not null default now()
);

-- A NEW table arrives with anon and authenticated holding everything —
-- Supabase's default privileges grant all on tables in public, and
-- 20260813000700's opening revoke only covered what existed in August. See
-- 20260826000200, which is the migration that had to clean up two tables that
-- forgot this one.
revoke all on public.activity_alerts from anon, authenticated;

-- Column-level on the writes, whole-table on select and delete. `notified_at`
-- and `created_at` are absent from both write lists on purpose.
grant select on public.activity_alerts to authenticated;
grant insert (user_id, radius_mi, enabled) on public.activity_alerts to authenticated;
grant update (radius_mi, enabled) on public.activity_alerts to authenticated;
grant delete on public.activity_alerts to authenticated;

alter table public.activity_alerts enable row level security;

create policy "own alert is readable"
  on public.activity_alerts for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "own alert is writable"
  on public.activity_alerts for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "own alert is editable"
  on public.activity_alerts for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own alert is deletable"
  on public.activity_alerts for delete
  to authenticated
  using (user_id = (select auth.uid()));

comment on table public.activity_alerts is
  'A member-created alert for "who is active near you". Premium is checked when the alert FIRES, not when it is saved, so a lapsed subscription stops the alert rather than deleting the member''s settings.';

-- ── who is due to be told ────────────────────────────────────────────────────
--
-- Modelled on claim_nearby_joins, including the part that matters most: the
-- count is taken through can_view_profile, so it counts only people the member
-- could actually see. A count that included the invisible would be a lie, and a
-- lie that leaks.
--
-- Self-consuming, like claim_drop_notifications — it stamps as it selects, in
-- one statement, so two runs in the same cooldown cannot both claim.
create or replace function public.claim_activity_alerts(
  p_window_hours integer default 24,
  p_min integer default 5,
  p_cooldown_hours integer default 24,
  p_from_hour integer default 9,
  p_to_hour integer default 21
)
returns table (user_id uuid, active integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_not_end_user('claim_activity_alerts');

  return query
  with viewer as (
    select p.id, p.location, a.radius_mi
      from public.activity_alerts a
      join public.profiles p on p.id = a.user_id
     where a.enabled
       and p.mode = 'dating'
       and p.verification_status = 'verified'
       and p.location is not null
       and (a.notified_at is null
            or a.notified_at <= now() - make_interval(hours => p_cooldown_hours))
       -- Not at four in the morning, in the member's own clock.
       and extract(hour from (now() at time zone p.timezone)) >= p_from_hour
       and extract(hour from (now() at time zone p.timezone)) < p_to_hour
       -- Checked when it FIRES. A subscription that lapses stops the alert at
       -- the next sweep, and nothing has to remember to go and delete a row.
       and public.is_premium(p.id)
  ),
  counted as (
    select v.id,
           (
             select count(*)
               from public.profiles n
              where n.id <> v.id
                and n.last_active_at is not null
                and n.last_active_at >= now() - make_interval(hours => p_window_hours)
                and n.location is not null
                -- Distance first: index-backed, and can_view_profile is a pile
                -- of joins not worth evaluating for somebody four states away.
                and extensions.ST_DWithin(
                      n.location,
                      v.location,
                      coalesce(v.radius_mi, 50) * 1609.344
                    )
                and public.can_view_profile(
                      v.id, n.id, n.community, n.cross_community_opt_in,
                      n.mode, n.verification_status
                    )
           )::integer as active
      from viewer v
  ),
  due as (
    -- §8's floor, the same five claim_nearby_joins uses. Below it nobody is
    -- told at all: in a thin local pool "2 people are active near you" plus a
    -- browse screen is a name.
    select c.id, c.active from counted c where c.active >= p_min
  ),
  claimed as (
    update public.activity_alerts a
       set notified_at = now()
      from due where a.user_id = due.id
    returning a.user_id as id
  )
  select claimed.id, due.active
    from claimed join due on due.id = claimed.id;
end;
$$;

revoke all on function public.claim_activity_alerts(integer, integer, integer, integer, integer)
  from public, anon, authenticated;

comment on function public.claim_activity_alerts(integer, integer, integer, integer, integer) is
  'Premium members whose own alert is due and who have at least p_min visible people active inside their chosen radius, stamped as it selects them. Returns a count to decide whether to send; the count never reaches the payload.';
