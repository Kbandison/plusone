-- Facts for the Drop (§6.1).
--
-- The split is deliberate: SQL gathers, TypeScript scores. The scoring lives in
-- packages/logic/drop where it is a pure function with 38 tests; duplicating it
-- here would mean two implementations of the ranking that decides who members
-- see, drifting apart quietly.
--
-- So this returns facts and no judgements. It does not order, weight, or limit.

create or replace function public.drop_candidates(p_max_radius_mi integer default 250)
returns table (
  id uuid,
  display_name text,
  age integer,
  age_band text,
  intention public.intention,
  photo_privacy public.photo_privacy,
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
    v.last_active_at,
    v.distance_mi,
    -- How many drops this profile has appeared in, anywhere. Feeds the
    -- underexposure term that stops the same faces winning every night.
    (select count(*) from public.drops d where v.id = any (d.served_profile_ids)) as times_served,
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

-- No quiz vector is returned, and that is not an oversight.
--
-- quiz_responses is own-row-only under RLS, correctly: a trait vector is
-- derived from a member's answers and handing other people's out to a client
-- would leak them. QUIZ_QUESTIONS is currently empty (§10 defers the quiz), so
-- every vector is absent and quizCompat scores neutral for everyone anyway.
--
-- When the quiz ships, the similarity must be computed HERE, in SQL, and
-- returned as a single number. Returning the vectors so the client can compare
-- them would be the easy version and the wrong one.

grant execute on function public.drop_candidates(integer) to authenticated;
