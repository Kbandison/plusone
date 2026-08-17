-- Two things wrong with drop_candidates, both silent.
--
-- 1. A SUPPORT-ONLY MEMBER'S PREVIEW LOST CARDS AND NEVER REFILLED THEM.
--    visible_profiles returns both dating and support-only profiles to a
--    support-only viewer — deliberately, so support-only members can find each
--    other (Decision #18). Those profiles entered the ranking and could take
--    the top three slots. loadPreviewCards then reads preview_profiles, which
--    requires mode = 'dating', so every support-only id returned no row and was
--    dropped by a .filter(Boolean). Nothing counted the loss or refilled the
--    slot, so a Preview Drop could come back with two cards, or one, or none,
--    while a pool of real dating members sat unranked.
--
--    Returning the target's mode lets the caller build the preview pool from
--    the same population that renders it. It leaks nothing: visible_profiles
--    already exposes `mode`, and Decision #19's preview exists precisely to
--    show a support-only member what dating members they would see.
--
-- 2. times_served COUNTED ONLY THE VIEWER'S OWN DROPS.
--    The subquery counts rows in `drops`, this function is deliberately NOT
--    security definer, and drops is own-rows-only under RLS — so "how many
--    drops has this profile appeared in, anywhere" actually answered "how many
--    of MY drops", which for a new member is always zero. The underexposure
--    term that stops the same faces winning every night was measuring the wrong
--    thing for everyone.
--
--    A definer helper returning one integer fixes it without making the
--    candidate query itself a definer — which would be a second path to
--    profiles that skips can_view_profile entirely.
create or replace function public.times_served_count(p_profile_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*) from public.drops d where p_profile_id = any (d.served_profile_ids);
$$;

revoke all on function public.times_served_count(uuid) from public, anon;
grant execute on function public.times_served_count(uuid) to authenticated;

comment on function public.times_served_count(uuid) is
  'How many drops a profile has appeared in, across everyone. A count and nothing '
  'else — definer because drops is own-rows-only, and a per-viewer count made the '
  'underexposure weight meaningless.';

-- Dropped rather than replaced: the return type gains target_mode, and
-- CREATE OR REPLACE cannot change one. Nothing in the database depends on it —
-- it is called from the app — so the drop is safe, and the grant is restated at
-- the bottom because dropping takes it with it.
drop function if exists public.drop_candidates(integer);

create function public.drop_candidates(p_max_radius_mi integer)
returns table (
  id uuid,
  display_name text,
  age integer,
  age_band text,
  intention public.intention,
  photo_privacy public.photo_privacy,
  target_mode public.member_mode,
  last_active_at timestamptz,
  distance_mi integer,
  times_served bigint,
  already_connected boolean,
  last_served_to_viewer_at timestamptz
)
language sql
stable
-- NOT security definer. This reads visible_profiles, which is security_invoker,
-- so every wall in can_view_profile() still applies as the caller. A definer
-- here would be a second path to profiles that skips the wall entirely.
set search_path = public, pg_temp
as $$
  select
    v.id,
    v.display_name,
    v.age,
    v.age_band,
    v.intention,
    v.photo_privacy,
    v.mode,
    v.last_active_at,
    v.distance_mi,
    public.times_served_count(v.id) as times_served,
    exists (
      select 1 from public.connects c
      where (c.initiator_id = (select auth.uid()) and c.target_id = v.id)
         or (c.target_id = (select auth.uid()) and c.initiator_id = v.id)
    ) as already_connected,
    (
      select max(d.created_at) from public.drops d
      where d.user_id = (select auth.uid()) and v.id = any (d.served_profile_ids)
    ) as last_served_to_viewer_at
  from public.visible_profiles v
  where v.distance_mi <= p_max_radius_mi;
$$;

comment on function public.drop_candidates(integer) is
  'Facts only. Ranking lives in packages/logic/drop so there is one implementation of it.';

-- The note that used to sit here said no quiz vector is returned because
-- "QUIZ_QUESTIONS is currently empty (§10 defers the quiz), so every vector is
-- absent and quizCompat scores neutral for everyone anyway". Twelve questions
-- shipped and that stopped being true, but drop.ts kept hardcoding null, so 30%
-- of the score was a constant. The vectors are now read server-side with the
-- service client (lib/drop.ts) rather than returned from here — same outcome the
-- note was protecting, without porting a tested cosine-and-confidence formula
-- into SQL where it would drift.

grant execute on function public.drop_candidates(integer) to authenticated;
