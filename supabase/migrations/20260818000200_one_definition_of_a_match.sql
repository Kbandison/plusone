-- The preference filter, in one place, so Browse obeys it too.
--
-- 20260818000100 taught the Drop to respect gender, seeking and age. Browse
-- learned nothing: it reads visible_profiles directly, so a member who said
-- they are a woman seeking women still had every man within range listed one
-- tab away from a Drop that had correctly excluded them. Two surfaces, two
-- answers to "who can I see", and only one of them right.
--
-- It also ignored the radius. `Number(filters.distance) || RADIUS.maxMi` meant
-- the default was two hundred and fifty miles — the maximum — so the last step
-- of onboarding decided nothing until a member found the filter and set it
-- again.
--
-- So the rule becomes a view and both surfaces read it. A wall that is written
-- twice is a wall with a hole in it the day one copy changes.
create view public.matched_profiles
with (security_invoker = false, security_barrier = true) as
  select v.*
  from public.visible_profiles v
  where
    -- Do I want them?
    (
      v.viewer_seeking is null
      or cardinality(v.viewer_seeking) = 0
      or v.gender is null
      or v.gender = any (v.viewer_seeking)
    )
    -- Do they want me?
    and (
      v.seeking is null
      or cardinality(v.seeking) = 0
      or v.viewer_gender is null
      or v.viewer_gender = any (v.seeking)
    )
    -- Are they in my range, and am I in theirs?
    and (v.viewer_age_min is null or v.age is null or v.age >= v.viewer_age_min)
    and (v.viewer_age_max is null or v.age is null or v.age <= v.viewer_age_max)
    and (v.age_min is null or v.viewer_age is null or v.viewer_age >= v.age_min)
    and (v.age_max is null or v.viewer_age is null or v.viewer_age <= v.age_max);

-- Supabase's default privileges hand every role everything on a NEW object in
-- this schema. 20260813000700 revoked that once, before this view existed.
revoke all on public.matched_profiles from anon, authenticated;
grant select on public.matched_profiles to authenticated;

-- drop_candidates stops carrying its own copy of the rule.
create or replace function public.drop_candidates(p_max_radius_mi integer)
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
  from public.matched_profiles v
  where v.distance_mi <= p_max_radius_mi;
$$;

grant execute on function public.drop_candidates(integer) to authenticated;
