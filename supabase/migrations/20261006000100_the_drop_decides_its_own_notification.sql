-- "Tonight's Drop is ready" still fired on Drops that were empty.
--
-- ── what was happening ─────────────────────────────────────────────────────
--
-- 20260921000100 taught the claim to ask `drop_has_candidates` first, which
-- wraps `drop_candidates` and asks whether it returns any row. It assumed
-- drop_candidates was the whole rule. It is half of it.
--
-- drop_candidates applies the WALLS — gender, age, intention, community,
-- blocks — and RETURNS three more facts as columns rather than filtering on
-- them: `already_connected`, `last_active_at` and `last_served_to_viewer_at`.
-- The TypeScript `isEligible` is what refuses a connected candidate, an
-- inactive one, and one shown to this member in the last thirty days. So in a
-- thin beta pool, where a member has met or been shown everybody in reach, the
-- claim said yes and the Drop said nobody.
--
-- Measured 2026-10-06: two of the seven real members who receive this push
-- were told on 5 October that their Drop had landed, with ZERO candidates the
-- Drop would show them.
--
-- ── so the Drop's own rule decides, in TypeScript ──────────────────────────
--
-- Restating isEligible here would fix tonight and drift by next month — it is
-- hot-tuned through app_config, it shares `activeFloor` with every reader, and
-- the last fix failed precisely by reusing one half of a rule split across two
-- languages. Instead the claim is split in two, and the decision in the middle
-- is `selectDrop`, the function that builds the Drop itself:
--
--   drop_notification_due      who is past 20:00 and not yet told — no stamp
--   drop_candidates_for        their candidate rows, read as each of them
--   (route)                    selectDrop(...).cards.length > 0
--   stamp_drop_notifications   stamp only those, and return who was stamped
--
-- Nothing is stamped until the decision is made, which is the property
-- 20260921000100 put inside the claim and the reason it gave: a member stamped
-- and then skipped is unnotified for the rest of the night even if the pool
-- fills at nine. A member with an empty Drop stays due and is asked again on
-- the next run.
--
-- `claim_drop_notifications` and `drop_has_candidates` are left in place. The
-- route falls back to them when these functions are missing — code reaches
-- production before the schema here as a matter of course — and dropping them
-- in the same file would break a deploy that predates this one. A later
-- migration can remove them once nothing calls them.

-- ── who is due ─────────────────────────────────────────────────────────────
--
-- The four conditions 20260921000100's claim checked before asking about
-- candidates, unchanged, and returned rather than stamped. Plus the two things
-- selectDrop needs about the viewer, so the route makes no second read.
create or replace function public.drop_notification_due(p_hour integer default 20)
returns table (
  user_id uuid,
  night date,
  search_radius_mi integer,
  intention public.intention
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with candidate as (
    select
      p.id,
      -- The night this member is currently in. Before the hour they are still
      -- in yesterday's, which is what dropNightDate does in TypeScript.
      case
        when extract(hour from public.local_now(p.timezone)) < p_hour
          then (public.local_now(p.timezone))::date - 1
        else (public.local_now(p.timezone))::date
      end as night,
      extract(hour from public.local_now(p.timezone)) as local_hour,
      p.drop_notified_night,
      p.search_radius_mi,
      p.intention
    from public.profiles p
    where p.onboarded_at is not null
      -- Dating mode only. A support-only member gets a Preview Drop, and a
      -- nightly push whose only call to action is "switch to dating" is a
      -- nightly nudge to give up the shield (§3.3).
      and p.mode = 'dating'
      and exists (select 1 from public.push_subscriptions s where s.user_id = p.id)
  )
  select c.id, c.night, c.search_radius_mi, c.intention
  from candidate c
  where c.local_hour >= p_hour
    and c.drop_notified_night is distinct from c.night;
$$;

revoke all on function public.drop_notification_due(integer) from public, anon, authenticated;

comment on function public.drop_notification_due(integer) is
  'Members past the drop hour who have not been told tonight. Stamps nothing — see stamp_drop_notifications. Service role only.';

-- ── their candidates ───────────────────────────────────────────────────────
--
-- drop_candidates is SECURITY INVOKER and reads auth.uid(), so a service-role
-- cron cannot ask it about somebody else. Same technique as
-- drop_has_candidates: set the request's claims to each member for the length
-- of their read, then put the caller's back.
--
-- Batched, because the route asks about every due member at once and a round
-- trip each is a round trip each, every fifteen minutes, for four hours.
--
-- Returns the columns isEligible and the ranking read and NOTHING ELSE — no
-- name, no age, no photo setting. It answers about other members on somebody
-- else's behalf, and it is granted to nobody: the service role bypasses grants
-- and no member has a reason to call it.
create or replace function public.drop_candidates_for(
  p_user_ids uuid[],
  p_radius_mi integer
)
returns table (
  viewer_id uuid,
  id uuid,
  intention public.intention,
  target_mode public.member_mode,
  last_active_at timestamptz,
  distance_mi integer,
  times_served bigint,
  already_connected boolean,
  last_served_to_viewer_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous text := current_setting('request.jwt.claims', true);
  v_viewer uuid;
begin
  foreach v_viewer in array coalesce(p_user_ids, '{}'::uuid[]) loop
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', v_viewer::text)::text,
      true
    );

    -- Every column qualified: the OUT names above are variables in here, and
    -- an unqualified `id` would be ambiguous.
    return query
      select
        v_viewer,
        dc.id,
        dc.intention,
        dc.target_mode,
        dc.last_active_at,
        dc.distance_mi,
        dc.times_served,
        dc.already_connected,
        dc.last_served_to_viewer_at
      from public.drop_candidates(p_radius_mi) dc;
  end loop;

  -- Back to whatever the caller had. `return query` has already materialised
  -- each member's rows, so nothing above reads the claims after this.
  perform set_config('request.jwt.claims', coalesce(v_previous, ''), true);
  return;
end;
$$;

revoke all on function public.drop_candidates_for(uuid[], integer) from public, anon, authenticated;

comment on function public.drop_candidates_for(uuid[], integer) is
  'drop_candidates, read as each of several members, eligibility columns only. Restores the caller''s claims. Service role only — it answers about somebody else by design.';

-- ── the stamp ──────────────────────────────────────────────────────────────
--
-- Only the members the route decided have a Drop, and only those still due —
-- the due set is recomputed here rather than trusted from the route, so an id
-- that was due a minute ago and has since been told is not stamped twice.
--
-- `drop_notified_night is distinct from due.night` is on the UPDATE ITSELF and
-- not only inside the due read, deliberately. Two overlapping runs both read
-- the same snapshot; the second update blocks on the first's row lock and then
-- re-evaluates its WHERE against the new row version, where the night now
-- matches — so it skips the row and returns nobody. That re-check is what makes
-- the claim self-consuming, and it only happens on a predicate the UPDATE owns.
create or replace function public.stamp_drop_notifications(
  p_hour integer,
  p_user_ids uuid[]
)
returns table (user_id uuid)
language sql
security definer
set search_path = public, pg_temp
as $$
  with due as (
    select d.user_id, d.night
    from public.drop_notification_due(p_hour) d
    where d.user_id = any (coalesce(p_user_ids, '{}'::uuid[]))
  ),
  stamped as (
    update public.profiles p
       set drop_notified_night = due.night
      from due
     where p.id = due.user_id
       and p.drop_notified_night is distinct from due.night
    returning p.id
  )
  select stamped.id from stamped;
$$;

revoke all on function public.stamp_drop_notifications(integer, uuid[]) from public, anon, authenticated;

comment on function public.stamp_drop_notifications(integer, uuid[]) is
  'Marks the given members as told about tonight''s Drop, if they are still due, and returns who was marked. The route decides who has a Drop first. Service role only.';
