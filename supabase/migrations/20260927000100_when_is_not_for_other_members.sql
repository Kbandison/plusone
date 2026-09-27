-- When somebody was last here is not for other members to read.
--
-- ── the leak ────────────────────────────────────────────────────────────────
--
-- c3425a3 (2026-09-23) started writing profiles.last_active_at once a day, and
-- stored the DAY rather than the moment so that no member could read another's
-- "last seen at 2:47pm". Review found the moment leaking anyway, one column
-- over: every UPDATE on profiles fires profiles_set_updated_at, which sets
-- updated_at = now(). So the daily activity write stamped the EXACT time of a
-- member's first visit each day into updated_at.
--
-- And members can read it. `authenticated` holds a column-level SELECT on
-- profiles.updated_at, and the "visible profiles are readable" policy opens
-- every row a member may view. Nothing in the app reads it — the only
-- updated_at the app reads is chats' and config's — so the read path existed
-- for nobody, and served exactly one thing: when somebody was last active, to
-- the second, to anybody who can see them and knows the API. Measured
-- 2026-09-27: 6 of 11 onboarded members had it move since the write shipped.
--
-- It was never only the activity write. The nightly Drop claim stamps
-- drop_notified_night and moves updated_at at the member's own 8pm; a profile
-- edit moves it too. Fixing the trigger for one bookkeeping column would leave
-- the rest, so the READ is what goes.
--
-- ── why a revoke, and why it is safe ───────────────────────────────────────
--
-- Column privileges are checked on every read path a member has: PostgREST
-- selects, and invoker functions. my_profile — the one that returns whole
-- profiles rows to their owner — is SECURITY DEFINER, so it reads as its owner
-- and loses nothing. visible_profiles and matched_profiles never carried the
-- column. The service client, the admin screens and the crons are unaffected.
--
-- What a member loses is reading their OWN updated_at directly, which no
-- screen does.
--
-- ── and the activity alert learns the day ─────────────────────────────────
--
-- claim_activity_alerts counted a neighbour as active if last_active_at fell
-- within the last p_window_hours. With day stamps that is wrong for part of
-- every day: after midnight UTC — the US evening, inside the alert's own 9am to
-- 9pm window — everybody active on the previous UTC day falls out of a 24-hour
-- window, and the count a member is told drops for no reason. The rule is now
-- the one the app uses everywhere (activeFloor in packages/config): active if
-- the stamp is on or after the UTC day the window STARTS in. Up to a day
-- generous, never falsely empty — the blur is the point of storing a day.
--
-- Everything else in the function is 20260829001000's, unchanged.
--
-- ── no grants move but the one ─────────────────────────────────────────────
--
-- The function keeps its signature, defaults and return type, so this is a
-- replace in place — no overload, and the cron's call is untouched.

revoke select (updated_at) on public.profiles from authenticated;

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
                -- The day the window starts in, not the instant: last_active_at
                -- holds a day (midnight UTC), so an instant comparison drops
                -- everybody active yesterday as soon as it is past midnight UTC.
                and n.last_active_at >= date_trunc(
                      'day',
                      (now() - make_interval(hours => p_window_hours)) at time zone 'UTC'
                    ) at time zone 'UTC'
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
