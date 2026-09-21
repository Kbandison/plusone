-- "Tonight's Drop is ready" must not fire when it is not.
--
-- ── what was happening ─────────────────────────────────────────────────────
--
-- `claim_drop_notifications` checked four things: onboarded, dating mode, a
-- push subscription, and the local hour. It never checked whether the member
-- would be shown anybody. So at 20:00 local it told them their Drop had landed
-- and the Drop was empty.
--
-- Measured 2026-09-21, on the first five people through the beta: every one of
-- them had ZERO candidates at the ladder's furthest rung. Four are women
-- seeking men; the only men on the app are seeded accounts in Atlanta, 488 to
-- 1574 miles away. The app was right and the notification was not.
--
-- A nightly push promising something that is not there is the worst kind this
-- app could send: §3.3 bans engagement bait, and a notification that reliably
-- leads to an empty screen teaches a member to ignore the one channel we have.
--
-- ── the check reuses the rule rather than restating it ─────────────────────
--
-- `drop_candidates` is the matching rule — mutual gender, mutual age, mutual
-- intention, community scope, blocks, connects already made, recent service.
-- Restating any of that here would be a second answer to "who can this person
-- see", and the two would drift.
--
-- It is SECURITY INVOKER and reads auth.uid(), so a service-role cron cannot
-- ask it about somebody else. This wrapper sets the request's claims to that
-- member for the length of one call and puts them back.
--
-- The restore is exact in the only sense that matters: `set_config` cannot
-- return a setting to unset — passing null leaves an empty string — but
-- `auth.uid()` is null for an empty string and for an unset one alike, verified
-- against this database before the function was written. Nothing downstream can
-- tell the two apart.
--
-- Returns a BOOLEAN. It reveals whether somebody's Drop would be empty and
-- nothing about who is in it, and it is granted to nobody: the cron runs as the
-- service role, which bypasses grants, and no member has a reason to ask this
-- about anyone.

create or replace function public.drop_has_candidates(
  p_user_id uuid,
  p_radius_mi integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous text := current_setting('request.jwt.claims', true);
  v_found boolean;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text)::text,
    true
  );

  select exists (select 1 from public.drop_candidates(p_radius_mi)) into v_found;

  -- Back to whatever the caller had, before anything else in this transaction
  -- runs. Without it the rest of the statement would execute as the member this
  -- was asked about.
  perform set_config('request.jwt.claims', coalesce(v_previous, ''), true);

  return coalesce(v_found, false);
end;
$$;

revoke all on function public.drop_has_candidates(uuid, integer) from public, anon, authenticated;

comment on function public.drop_has_candidates(uuid, integer) is
  'Would this member be shown anybody tonight? Wraps drop_candidates as that member and restores the caller. Service role only — it answers about somebody else by design.';

/**
 * The claim, with one more condition.
 *
 * Everything else is 20260819000200's and unchanged; the new line is the last
 * one in `due`, and it is inside the CLAIM rather than in the route on purpose.
 * The claim STAMPS drop_notified_night — so checking afterwards would mark a
 * member as told, skip the send, and leave them unnotified for the rest of the
 * night even if the pool filled at nine o'clock.
 *
 * Checked LAST, after the cheap conditions have cut the set down. It runs
 * drop_candidates once per member still standing, which at this size is a
 * handful and at any size is only the people whose local hour has just passed
 * 20:00 and who have not been told yet.
 */
-- DROP FIRST. A new parameter is a new FUNCTION, not a replacement.
--
-- `create or replace` with an extra argument leaves the one-argument version in
-- place and adds a second, and then `claim_drop_notifications(20)` — which is
-- exactly how the cron calls it — fails with "function is not unique". Not a
-- silent overload: the nightly notification stops entirely.
--
-- The dry run does not catch it. It verifies that every object the file
-- declares resolves afterwards, and both of them did; what broke was an
-- existing CALLER. Found by calling it the way the cron does, inside a
-- rolled-back transaction, which is the only thing that would have.
--
-- Same family as the `create or replace cannot change a return type` trap in
-- HANDOFF.md, and the same lesson: check:sql parses it, the dry run applies it,
-- and only exercising the call site says whether it still works.
drop function if exists public.claim_drop_notifications(integer);

create or replace function public.claim_drop_notifications(
  p_hour integer default 20,
  p_radius_mi integer default 350
)
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
      -- ...and there is actually somebody to show them.
      --
      -- Last, so it only runs for the few members the conditions above left
      -- standing. Not stamped when false: they stay unclaimed and are asked
      -- again on the next run, so a pool that fills later the same evening
      -- still reaches them.
      and public.drop_has_candidates(c.id, p_radius_mi)
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

revoke all on function public.claim_drop_notifications(integer, integer) from public, anon, authenticated;

comment on function public.claim_drop_notifications(integer, integer) is
  'Who to tell their Drop has landed, claimed once per night per member. Only members who would actually be shown somebody — see drop_has_candidates.';
