-- Who a member is, and who they are looking for.
--
-- `gender` and `seeking` have been columns since the first migration — §12 of
-- the spec lists them both. Nothing has ever written them and nothing has ever
-- read them: they appear in no form, no action, no scorer and no query. The
-- Drop's candidate pool filters on distance, prior connects and prior
-- appearances, and nothing else, so every member has been shown to every other
-- member within their radius regardless of gender or of who either of them
-- wanted to meet. On a dating product that is not a missing feature, it is the
-- feature not existing.
--
-- This gives them types and a set of values, adds the preferences that decide a
-- match alongside them, and makes the Drop obey all of it.
--
-- NOT a hard wall between intentions: Decision #10 says soft-rank only, and
-- that stays exactly as it is. Gender and age are a different question and the
-- spec says nothing that forbids filtering them.

-- ── 1. The vocabularies ───────────────────────────────────────────────────────
-- Enums rather than free text, for the same reason every other classification
-- here is one: a typo'd 'Woman' silently matches nobody, forever, and the
-- member who typed it never finds out.
create type public.gender_identity as enum ('woman', 'man', 'non_binary', 'other');

-- Shared by smoking and drinking. Two enums with identical members would be two
-- places to widen later, and no reader could tell why they differed.
create type public.lifestyle_frequency as enum ('never', 'sometimes', 'often');

create type public.kids_status as enum ('none', 'have', 'have_grown');
create type public.kids_plan as enum ('want', 'open', 'no', 'unsure');

-- ── 2. Give the existing columns their types ──────────────────────────────────
-- visible_profiles selects both, so it has to go first and come back after.
-- drop_candidates reads the view; its body is a string, so Postgres does not
-- track the dependency and would let it break at call time instead. Dropped and
-- rebuilt deliberately rather than left to find out.
drop function if exists public.drop_candidates(integer);
drop view if exists public.visible_profiles;

-- No row has ever held a value, so there is nothing to preserve and the cast
-- cannot fail on real data. The using clause is here for the empty case only.
alter table public.profiles
  alter column gender type public.gender_identity
    using nullif(gender, '')::public.gender_identity;

alter table public.profiles
  alter column seeking drop default;

alter table public.profiles
  alter column seeking type public.gender_identity[]
    using seeking::public.gender_identity[];

alter table public.profiles
  alter column seeking set default '{}'::public.gender_identity[];

-- ── 3. The preferences themselves ─────────────────────────────────────────────
alter table public.profiles
  -- Nullable, and null means "no preference stated" everywhere it is read. A
  -- default of 18–99 would be a preference the member never expressed, and the
  -- filter below would enforce it against them.
  add column if not exists age_min smallint,
  add column if not exists age_max smallint,
  add column if not exists smokes public.lifestyle_frequency,
  add column if not exists drinks public.lifestyle_frequency,
  add column if not exists kids public.kids_status,
  add column if not exists kids_plan public.kids_plan;

alter table public.profiles
  add constraint profiles_age_range_is_adult
    check (
      (age_min is null or age_min >= 18)
      and (age_max is null or age_max <= 120)
      -- A range with the ends swapped matches nobody and reads as an empty
      -- Drop rather than as a mistake.
      and (age_min is null or age_max is null or age_min <= age_max)
    );

-- ── 4. Grants ─────────────────────────────────────────────────────────────────
-- Column-level, like every other member-writable field on this table. gender
-- and seeking already carry all three.
grant select (age_min, age_max, smokes, drinks, kids, kids_plan)
  on public.profiles to authenticated;
grant insert (age_min, age_max, smokes, drinks, kids, kids_plan)
  on public.profiles to authenticated;
grant update (age_min, age_max, smokes, drinks, kids, kids_plan)
  on public.profiles to authenticated;

-- ── 5. The view, rebuilt ──────────────────────────────────────────────────────
-- Unchanged except for what it carries. Still security_invoker=false and
-- security_barrier=true: i_can_view is the wall, and a barrier stops a cheap
-- user-supplied function being evaluated before it.
--
-- The viewer's own preferences ride along. drop_candidates runs as the invoker,
-- so reading the viewer's row there would be at the mercy of the row policy;
-- reading it HERE, inside a definer view, is the same trick the existing
-- `viewer.location` lateral already uses, and it exposes nothing to the member
-- that is not already their own.
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

-- Supabase's default privileges grant every role everything on a NEW object in
-- this schema, and 20260813000700 revoked that once — at a time when this view
-- already existed. Recreating it created a fresh object, which quietly came
-- back with anon holding SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES
-- and TRIGGER on the view that decides who can see whom. check:db caught it.
revoke all on public.visible_profiles from anon, authenticated;
grant select on public.visible_profiles to authenticated;

-- ── 6. The Drop obeys it ──────────────────────────────────────────────────────
-- Mutual, in both directions, for gender and for age. A one-sided filter is the
-- version that shows a woman seeking women to every man in the county.
--
-- An unstated preference matches EVERYONE rather than no one. Every member
-- alive right now has an empty `seeking` and a null age range, because nothing
-- ever asked them: defaulting the other way would empty every Drop in the
-- product the moment this deployed.
--
-- Lifestyle is deliberately NOT a wall. This is a pool of people who share a
-- diagnosis in one city, not a national dating app, and Decision #11 already
-- warns that it thins. Filtering that pool again on smoking would empty it —
-- those answers belong on the profile and in the ranking, not in the where
-- clause.
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
  from public.visible_profiles v
  where v.distance_mi <= p_max_radius_mi
    -- Do I want them?
    and (
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
$$;

grant execute on function public.drop_candidates(integer) to authenticated;
