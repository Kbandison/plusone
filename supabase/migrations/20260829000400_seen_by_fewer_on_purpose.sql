-- Incognito browse (backlog server 18a).
--
-- `PREMIUM_INCLUDES` has promised this on two public pages since before it
-- existed: "Incognito browse — visible only to people you've already connected
-- with". The string appeared nowhere else in the repository.
--
-- ── the gate is a missing grant, not a check ────────────────────────────────
--
-- `profiles` carries NO whole-table grant — column-level only. So the strongest
-- available gate is to never grant `update (incognito)` at all and write it
-- through a definer function. A member then has no path to the column, rather
-- than a path that is checked and could be reached another way.
--
-- That differs from 18b's trigger, and the difference is structural rather than
-- stylistic: `profile_photos` DOES carry a whole-table update grant, so a
-- member can PATCH it straight through PostgREST and only a trigger holds. Read
-- `information_schema.role_table_grants` before choosing — not the migration
-- that created the table, since 20260826000200 exists precisely because a
-- table's grants are not what its creating file says.
--
-- ── a lapse must never make somebody MORE visible ───────────────────────────
--
-- The rule this feature turns on, and the reason it is stated here rather than
-- left to the UI: **premium gates turning incognito ON. It never gates keeping
-- it, and it never gates turning it off.**
--
-- If a lapsed subscription silently un-hid a member, the app would expose
-- somebody who is ill to a directory they had paid to be absent from, at a
-- moment they were not present and had not agreed to anything. macOS reached
-- the same asymmetry independently for per-photo privacy — overrides retained
-- forever, premium gating only the setting of them — and it is the same rule.
--
-- Turning it OFF is deliberately never gated either. A member whose premium
-- lapsed while incognito must not be trapped invisible behind a paywall; that
-- would be selling the exit rather than the feature.
--
-- **One of THREE sites of this rule, and the paid filters are the odd one out:**
--
--     photo overrides (18b)  KEPT on a lapse
--     incognito (18a)        KEPT on a lapse
--     paid filters (18d)     DROPPED on a lapse
--
-- Said here because they are a short import apart and each is wrong applied to
-- another. Applying the FILTER rule to this one is the dangerous direction: it
-- would un-hide somebody who is ill because their card expired.
--
-- The principle underneath all three is neither "keep" nor "drop". It is: the
-- safe direction is whichever one does not increase the member's OWN exposure.
-- Dropping a filter exposes nobody, it shows the viewer more people. Dropping
-- incognito or a photo override exposes the member. One control acts on what a
-- member sees and the other two on who sees them, so one rule points two ways.
--
-- ── what "already connected with" means, precisely ──────────────────────────
--
-- Accepted connects both ways, PLUS anything the incognito member initiated
-- themselves at any status. The second half is not generosity, it is a bug fix
-- written before the bug: a member who sends a connect while incognito would
-- otherwise arrive in somebody's inbox as an unanswerable request from a
-- profile that cannot be opened. Visibility follows the incognito member's own
-- choices — if they reached out, they chose to be seen by that person.
--
-- Deliberately NOT including connects sent TO them and not yet accepted. That
-- is the exact case the feature exists for.

alter table public.profiles
  add column if not exists incognito boolean not null default false;

comment on column public.profiles.incognito is
  'Premium. Hides the member from discovery. NO update grant - written only by set_incognito(), which gates ON and never gates OFF.';

-- ── who can see an incognito member ──────────────────────────────────────────
-- Definer, because `connects` is own-rows-only and this is asked about rows the
-- viewer may not be an end of. Self-relative like i_can_view, so it can only
-- ever be asked about the caller's own reach.
create or replace function public.sees_incognito(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.connects c
    where
      (
        c.status = 'accepted'
        and (
          (c.initiator_id = (select auth.uid()) and c.target_id = p_target)
          or (c.initiator_id = p_target and c.target_id = (select auth.uid()))
        )
      )
      -- They reached out to me. Any status: an unanswered request has to be
      -- answerable, and they chose to be seen by sending it.
      or (c.initiator_id = p_target and c.target_id = (select auth.uid()))
  );
$$;

grant execute on function public.sees_incognito(uuid) to authenticated;

-- ── the only writer ──────────────────────────────────────────────────────────
-- No `grant update (incognito)` anywhere, deliberately. This is the whole gate.
create or replace function public.set_incognito(p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Turning it OFF is never gated. A member whose premium lapsed while
  -- incognito must not be trapped invisible behind a paywall.
  if p_on and not public.is_premium((select auth.uid())) then
    raise exception 'incognito requires premium'
      using errcode = 'insufficient_privilege';
  end if;

  update public.profiles set incognito = p_on, updated_at = now()
  where id = (select auth.uid());

  return p_on;
end;
$$;

revoke all on function public.set_incognito(boolean) from public, anon, authenticated;
grant execute on function public.set_incognito(boolean) to authenticated;

-- ── the view, rebuilt ─────────────────────────────────────────────────────────
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
    p.incognito,
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
    and public.i_can_view(p.id, p.community, p.cross_community_opt_in, p.mode, p.verification_status)
    -- Incognito (server 18a). Placed AFTER i_can_view rather than inside it: the
    -- walls are about who may see whom, and this is a member choosing to be
    -- seen by fewer of them. Folding it into can_view_profile would put a
    -- premium feature inside the function that also gates the community wall
    -- and the support-only shield, and PREMIUM_NEVER forbids a paid feature
    -- going anywhere near those.
    and (not p.incognito or public.sees_incognito(p.id));

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
