-- Religion and politics.
--
-- 20260829000100 left these out on purpose and said why: under GDPR Article 9
-- both are SPECIAL CATEGORY data — the same tier as the health data this whole
-- product is built around, and the reason there is a separate consent screen
-- with an unbundled checkbox at all. That made it a question for Kevin rather
-- than a schema decision, and it is answered: add them, 2026-08-29.
--
-- So this is deliberately its own migration rather than an edit to that one.
-- The reasoning above is the whole point of the split — somebody reading the
-- history should be able to see that these two were held, asked about, and
-- added on an answer, rather than arriving in a list beside pets.
--
-- ── what this obliges, beyond the columns ────────────────────────────────────
--
-- These are the FIRST special-category fields on this table that a member types
-- into a profile for other members to read. `community`, `condition` and
-- `u_equals_u` are Article 9 too, but they sit behind a consent screen, a
-- community wall and a verification wall, and none of them is optional in the
-- way these are.
--
--   * Both are nullable and both carry `prefer_not_to_say` as a real value,
--     which is not the same thing as null. Null is "never asked"; the explicit
--     value is "asked, and declining is my answer". A form that cannot express
--     the second one collects a worse version of the first.
--   * privacy-labels.ts classifies both as Sensitive Info, which is a category
--     PRIVACY_LABELS already declares — so no new Apple category and no change
--     to play-data-safety.ts.
--   * Kevin 1 (counsel review of the policy and terms) is still open and this
--     belongs in it. The policy should name religious and political belief
--     among what a member may choose to publish, and it does not yet.

-- ── 1. The vocabularies ───────────────────────────────────────────────────────
-- Short lists, and short on purpose. This app already asks people to disclose a
-- diagnosis; following it with a taxonomy of belief spends trust it needs
-- elsewhere. The same argument GENDER_LABELS makes for four options.
--
-- `prefer_not_to_say` is a member's answer, not the absence of one. It is in
-- the enum rather than left to null so that declining is something a person can
-- actively say on their profile, and so a filter can be built that respects it
-- rather than lumping the declined in with the unasked.
create type public.religion_kind as enum (
  'agnostic',
  'atheist',
  'buddhist',
  'christian',
  'hindu',
  'jewish',
  'muslim',
  'spiritual',
  'other',
  'prefer_not_to_say'
);

-- Not a party, and not a left-right axis with a midpoint that flatters nobody.
-- A party label ages badly and travels worse; this is how somebody would
-- describe themselves at a table.
create type public.politics_kind as enum (
  'progressive',
  'liberal',
  'moderate',
  'conservative',
  'apolitical',
  'other',
  'prefer_not_to_say'
);

-- ── 2. The columns ────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists religion public.religion_kind,
  add column if not exists politics public.politics_kind;

comment on column public.profiles.religion is
  'GDPR Article 9 special category. Optional, and prefer_not_to_say is an answer rather than the absence of one.';
comment on column public.profiles.politics is
  'GDPR Article 9 special category. Optional, and prefer_not_to_say is an answer rather than the absence of one.';

-- ── 3. Grants ─────────────────────────────────────────────────────────────────
grant select (religion, politics) on public.profiles to authenticated;
grant insert (religion, politics) on public.profiles to authenticated;
grant update (religion, politics) on public.profiles to authenticated;

-- ── 4. The view ───────────────────────────────────────────────────────────────
-- Rebuilt for the same reason 20260829000100 rebuilt it: a view records the
-- column list it was created with, `matched_profiles` is `select v.*` over it
-- and inherits nothing new without being recreated, and `drop_candidates` reads
-- that view through a string body Postgres does not track.
--
-- Byte-identical to 20260829000100's apart from the two columns.
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
