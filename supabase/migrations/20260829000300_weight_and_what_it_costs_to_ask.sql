-- Weight, and what it costs to ask.
--
-- Kevin's call, 2026-08-29, asked for directly. Written up rather than just
-- added because this is the one field in the set whose risk is specific to THIS
-- app rather than general.
--
-- ── why it is not simply "height, again" ─────────────────────────────────────
--
-- In the HIV community body weight correlates with treatment history — wasting,
-- and lipodystrophy from older antiretrovirals. So a weight filter on a pool
-- defined by a diagnosis can function as a proxy for health status and
-- treatment era in a way a height filter cannot, and it does so without ever
-- naming them. That is not a reason it cannot exist; it is the reason it is
-- classified as health data below rather than as another profile attribute.
--
-- It is also the field mainstream dating apps most deliberately do not offer.
-- Height is common; weight is close to absent, and not by oversight.
--
-- ── what follows from that ──────────────────────────────────────────────────
--
--   * privacy-labels.ts classifies it "Health & Fitness -> Health", not
--     "User Content". Apple's Health type is what HealthKit stores and body
--     weight is squarely in it. No NEW category — that one is already declared
--     for `condition` — but it does widen what the declaration COVERS, from
--     three fields behind a consent screen and a community wall to one a member
--     types onto a profile other members read. Kevin knows; it belongs in
--     Kevin 1 with religion and politics.
--   * Unstated is the default and stays legible as unstated. Same rule as every
--     optional column here: null means nobody asked at a moment they were
--     willing to answer.
--   * Kept OUT of the mutual wall, like every other attribute added since
--     20260818000100. It is a filter a member can undo, never a rule applied to
--     them by somebody else's preference.

alter table public.profiles
  add column if not exists weight_kg smallint;

-- Kilograms, stored as the number so a range filter is a range. The bounds are
-- a sanity check rather than a claim about people: they exist to refuse a
-- typo'd 4 or 900, which would otherwise sit in a filter forever matching
-- nobody. Same shape and the same reasoning as profiles_height_range.
alter table public.profiles
  add constraint profiles_weight_range
    check (weight_kg is null or weight_kg between 35 and 250);

comment on column public.profiles.weight_kg is
  'Kilograms. Health data for labelling purposes - see privacy-labels.ts and the header of this migration.';

grant select (weight_kg) on public.profiles to authenticated;
grant insert (weight_kg) on public.profiles to authenticated;
grant update (weight_kg) on public.profiles to authenticated;

-- ── the view, rebuilt ─────────────────────────────────────────────────────────
-- Third rebuild in one day, and each is deliberate: a view records the column
-- list it was created with, so every added column needs one.

drop function if exists public.drop_candidates(integer);
drop view if exists public.matched_profiles;
drop view if exists public.visible_profiles;

create view public.visible_profiles
with (security_invoker = false, security_barrier = true) as
  select
    p.id,
    p.display_name,
    public.age_from_birthdate(p.birthdate) as age,
    public.age_band(p.birthdate) as age_band,
    p.gender,
    p.seeking,
    p.community,
    p.condition,
    p.u_equals_u,
    p.intention,
    p.mode,
    p.bio,
    p.prompts,
    p.photo_privacy,
    p.last_active_at,
    public.distance_mi(viewer.location, p.location) as distance_mi,
    p.age_min,
    p.age_max,
    p.smokes,
    p.drinks,
    p.kids,
    p.kids_plan,
    p.height_cm,
    p.weight_kg,
    p.relationship_structure,
    p.exercise,
    p.diet,
    p.pets,
    p.education,
    p.work,
    p.languages,
    p.religion,
    p.politics,
    (
      select count(*)
      from jsonb_array_elements(p.prompts) as prompt
      where coalesce(btrim(prompt ->> 'answer'), '') <> ''
    ) as answered_prompts,
    viewer.gender as viewer_gender,
    viewer.seeking as viewer_seeking,
    public.age_from_birthdate(viewer.birthdate) as viewer_age,
    viewer.age_min as viewer_age_min,
    viewer.age_max as viewer_age_max
  from public.profiles p
  cross join lateral (
    select
      profiles.location,
      profiles.gender,
      profiles.seeking,
      profiles.birthdate,
      profiles.age_min,
      profiles.age_max
    from public.profiles
    where profiles.id = (select auth.uid())
  ) viewer
  where p.id <> (select auth.uid())
    and public.i_can_view(p.id, p.community, p.cross_community_opt_in, p.mode, p.verification_status);

comment on view public.visible_profiles is
  'The only read path to other members. Enforces community wall, mode wall, block lists and verified-only in SQL. Never query public.profiles directly for someone else.';

revoke all on public.visible_profiles from anon, authenticated;
grant select on public.visible_profiles to authenticated;

-- Unchanged. Neither of these is a wall, and neither should ever become one:
-- the mutual rule below is gender and age, and 20260818000100's argument about
-- lifestyle applies with far more force here. A pool of people who share a
-- diagnosis in one city, filtered again in the WHERE clause on religion, is
-- empty — and it would be empty in a way nobody could see or undo.
create view public.matched_profiles
with (security_invoker = false, security_barrier = true) as
  select v.*
  from public.visible_profiles v
  where
    (
      v.viewer_seeking is null
      or cardinality(v.viewer_seeking) = 0
      or v.gender is null
      or v.gender = any (v.viewer_seeking)
    )
    and (
      v.seeking is null
      or cardinality(v.seeking) = 0
      or v.viewer_gender is null
      or v.viewer_gender = any (v.seeking)
    )
    and (v.viewer_age_min is null or v.age is null or v.age >= v.viewer_age_min)
    and (v.viewer_age_max is null or v.age is null or v.age <= v.viewer_age_max)
    and (v.age_min is null or v.viewer_age is null or v.viewer_age >= v.age_min)
    and (v.age_max is null or v.viewer_age is null or v.viewer_age <= v.age_max);

comment on view public.matched_profiles is
  'visible_profiles plus the mutual gender and age rule. The Drop and Browse both read this, so the rule cannot drift between them.';

revoke all on public.matched_profiles from anon, authenticated;
grant select on public.matched_profiles to authenticated;

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
