-- What a profile can say about a person, beyond the four things it held.
--
-- Backlog server 17. 20260818000100 gave this table gender, seeking, an age
-- range and four lifestyle answers, and 3fc2212 finally put those four on a
-- screen. Filtering got much deeper without a migration because everything it
-- needed was already here; this is the part that was not.
--
-- Eight columns, one of them reusing an enum that already exists. Each is a
-- thing people actually sort on, and each is a thing a member CHOOSES — which
-- is the line this file does not cross. `condition` and `u_equals_u` are the
-- only attributes on this table nobody picked, they are already in the view,
-- and making them filterable is held for a decision rather than smuggled in
-- beside a question about pets.
--
-- ── two that are deliberately absent ────────────────────────────────────────
--
-- RELIGION AND POLITICS are not here, and not because they are unpopular
-- fields. Under GDPR Article 9 both are SPECIAL CATEGORY data — the same tier
-- as the health data this whole product is built around, and the reason there
-- is a separate consent screen with an unbundled checkbox at all. Adding them
-- means two more special categories in the consent flow, the privacy policy and
-- both stores' data-safety forms. That is a counsel question (Kevin 1, already
-- open) and not a schema one, so it waits for an answer rather than arriving as
-- a side effect of a migration about height.
--
-- A STAR SIGN is not here either, and it would have been free — `birthdate` is
-- on this table and the sign is a pure function of it. It is absent because
-- that function runs backwards: a sign narrows a birthdate to a thirty-day
-- window, and this schema says at the top that birthdate "is NEVER exposed; the
-- visible_profiles view returns an age integer only." Exact age plus a
-- thirty-day window is most of a birthdate. A fun field is not worth quietly
-- undoing the one sentence this table opens with.
--
-- OCCUPATION is a controlled list rather than free text, for the reason
-- Decision #6 gives about condition fields: free text on a profile is a
-- moderation surface, and this one would collect employer names.

-- ── 1. The vocabularies ───────────────────────────────────────────────────────
-- Enums rather than free text, and 20260818000100 already gave the reason: a
-- typo'd value silently matches nobody, forever, and the member who typed it
-- never finds out.
--
-- Every one of these carries the option that means "none of these". A list that
-- forces a member into the nearest wrong answer produces data that is worse
-- than the null it replaced, because a null is legible as unstated and a wrong
-- answer is not.

create type public.relationship_structure as enum (
  'monogamous',
  'open',
  'polyamorous',
  'unsure'
);

create type public.diet_kind as enum (
  'omnivore',
  'pescatarian',
  'vegetarian',
  'vegan',
  'other'
);

create type public.pets_kind as enum (
  'none',
  'dogs',
  'cats',
  'both',
  'other'
);

create type public.education_level as enum (
  'high_school',
  'trade',
  'some_college',
  'bachelors',
  'masters',
  'doctorate',
  'other'
);

-- A field of work, not a job title. Broad enough that nobody in a city is the
-- only person holding one, which a job title very often is.
create type public.work_field as enum (
  'healthcare',
  'education',
  'technology',
  'trades',
  'arts',
  'service',
  'business',
  'public_service',
  'student',
  'other'
);

-- Languages, as an enum rather than free text or loose tags.
--
-- The first draft of this file made it `text[]` with a CHECK enforcing BCP-47
-- shape, on the theory that a list which keeps growing should not need a
-- migration to grow. Two things were wrong with that. A CHECK constraint cannot
-- contain a subquery and cannot call a non-immutable function, so the check as
-- written would have been rejected by Postgres the moment it was applied —
-- `check:sql` parses grammar and could not see it. And the theory was wrong
-- anyway: widening an enum is `alter type ... add value`, a one-line migration,
-- which is a smaller price than the thing this table's own comments warn about
-- twice — a typo'd value that silently matches nobody, forever, with no way for
-- the member who typed it to find out.
--
-- The list is the languages most spoken in the United States plus the largest
-- world languages, and it is deliberately not a complete one. `other` is what
-- makes a short list honest.
create type public.language_tag as enum (
  'en', 'es', 'zh', 'tl', 'vi', 'ar', 'fr', 'ko', 'ru', 'de',
  'ht', 'pt', 'it', 'hi', 'pl', 'ur', 'fa', 'ja', 'bn', 'pa',
  'he', 'el', 'sw', 'am', 'so', 'other'
);

-- ── 2. The columns ────────────────────────────────────────────────────────────
-- All nullable, and null means "not stated" everywhere it is read — the same
-- rule 20260818000100 set for age_min/age_max, and for the same reason. Every
-- member alive right now has none of these, because nothing has ever asked
-- them. A default would be a preference they never expressed, and the filters
-- would enforce it against them from the moment this deployed.
alter table public.profiles
  add column if not exists height_cm smallint,
  add column if not exists relationship_structure public.relationship_structure,
  -- Reuses lifestyle_frequency rather than declaring a third identical enum.
  -- 20260818000100 made that enum shared for exactly this: two enums with the
  -- same members are two places to widen later, and no reader could tell why
  -- they differed.
  add column if not exists exercise public.lifestyle_frequency,
  add column if not exists diet public.diet_kind,
  add column if not exists pets public.pets_kind,
  add column if not exists education public.education_level,
  add column if not exists work public.work_field,
  -- A set, because plenty of people speak more than one and a single-choice
  -- column would ask them to rank their own languages. Same shape as `seeking`,
  -- and read the same way: an empty set means unstated, never "speaks nothing".
  add column if not exists languages public.language_tag[] not null default '{}';

-- Centimetres, and stored as the number rather than as a band, so a range
-- filter is a range rather than a set of buckets somebody has to agree on. The
-- bounds are a sanity check, not a claim about people: they exist to refuse a
-- typo'd 17 or 700, which would otherwise sit in a filter forever matching
-- nobody.
alter table public.profiles
  add constraint profiles_height_range
    check (height_cm is null or height_cm between 120 and 240);

-- The enum already refuses anything that is not a language. What it cannot
-- refuse is all of them at once: `languages` is a set a member picks from a
-- form, and a row holding twenty-six is either a mistake or somebody gaming a
-- filter into matching every search. cardinality is immutable, which the check
-- this replaced was not.
alter table public.profiles
  add constraint profiles_languages_count
    check (cardinality(languages) <= 8);

comment on column public.profiles.height_cm is
  'Centimetres. Stored as a number so a range filter is a range, not a set of agreed buckets.';
comment on column public.profiles.languages is
  'ISO 639-1 codes as an enum array, plus ''other''. Empty means unstated, never ''speaks nothing''.';
comment on column public.profiles.work is
  'A field of work, never a job title — a title is often unique to one person in a city.';

-- ── 3. Grants ─────────────────────────────────────────────────────────────────
-- Column-level, like every other member-writable field on this table, and
-- `check:columns` enforces that this list stays complete. A column granted
-- select but not update is a field the profile editor silently fails to save.
grant select (
  height_cm, relationship_structure, exercise, diet, pets, education, work, languages
) on public.profiles to authenticated;
grant insert (
  height_cm, relationship_structure, exercise, diet, pets, education, work, languages
) on public.profiles to authenticated;
grant update (
  height_cm, relationship_structure, exercise, diet, pets, education, work, languages
) on public.profiles to authenticated;

-- ── 4. The views, rebuilt ─────────────────────────────────────────────────────
-- `matched_profiles` is `select v.*` over `visible_profiles`, so it inherits
-- every new column for free — but it still has to be dropped and recreated,
-- because a view records the column list it was created with rather than
-- re-resolving the star. Without this it would keep returning exactly the
-- columns that existed in August.
--
-- `drop_candidates` reads `matched_profiles` and its body is a string, so
-- Postgres does not track the dependency and would let it break at call time
-- instead. Dropped and rebuilt deliberately rather than left to find out —
-- 20260818000100 learned that one already.
drop function if exists public.drop_candidates(integer);
drop view if exists public.matched_profiles;
drop view if exists public.visible_profiles;

-- Unchanged except for what it carries. Still security_invoker=false and
-- security_barrier=true: i_can_view is the wall, and a barrier stops a cheap
-- user-supplied function being evaluated before it.
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
    p.relationship_structure,
    p.exercise,
    p.diet,
    p.pets,
    p.education,
    p.work,
    p.languages,
    -- How much of the profile is filled in. Cheap here, and it is the honest
    -- version of a filter Browse currently approximates with "bio is not null":
    -- `prompts` is jsonb and PostgREST has no length predicate for it, so a
    -- has-answered-a-prompt filter could not be written at all from the client.
    -- Counting only answered ones, because an untouched prompt row is stored
    -- the same as an answered one and would otherwise read as an answer.
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

-- Supabase's default privileges grant every role everything on a NEW object in
-- this schema, and a recreated view is a new object. 20260818000100 was caught
-- by check:db doing exactly this.
revoke all on public.visible_profiles from anon, authenticated;
grant select on public.visible_profiles to authenticated;

-- The preference filter, in one place, so Browse obeys it too. Unchanged: none
-- of the eight columns above is a wall, for the reason 20260818000100 gives
-- about lifestyle — this is a pool of people who share a diagnosis in one city,
-- and filtering that pool again in the where clause empties it. They belong on
-- the profile and in the filters, which a member can undo, not here.
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

comment on view public.matched_profiles is
  'visible_profiles plus the mutual gender and age rule. The Drop and Browse both read this, so the rule cannot drift between them.';

revoke all on public.matched_profiles from anon, authenticated;
grant select on public.matched_profiles to authenticated;

-- Byte-identical to 20260818000200's, and recreated only because the views it
-- reads were dropped.
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
