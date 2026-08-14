-- Plus One — the only read paths to other members (spec §5.3.2)
--
-- `visible_profiles` is the ONLY way one member sees another. Condition and U=U
-- fields pass through this view exclusively. Both views are security_invoker so
-- the profiles RLS policy still applies underneath — the WHERE clause here is a
-- second, independent statement of the same wall, not a replacement for it.
--
-- Neither view exposes birthdate or location. Age is computed; distance is
-- bucketed. Raw coordinates never leave the database.

create or replace function public.age_band(p_birthdate date)
returns text
language sql
immutable
as $$
  select case
    when a < 25 then '18–24'
    when a < 30 then '25–29'
    when a < 40 then '30–39'
    when a < 50 then '40–49'
    when a < 60 then '50–59'
    else '60+'
  end
  from (select public.age_from_birthdate(p_birthdate) as a) s;
$$;

-- ── visible_profiles ──────────────────────────────────────────────────────────
create view public.visible_profiles
with (security_invoker = true) as
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
  public.distance_mi(viewer.location, p.location) as distance_mi
from public.profiles p
cross join lateral (
  select location from public.profiles where id = (select auth.uid())
) viewer
where p.id <> (select auth.uid())
  and public.can_view_profile(
        (select auth.uid()),
        p.id,
        p.community,
        p.cross_community_opt_in,
        p.mode,
        p.verification_status
      );

comment on view public.visible_profiles is
  'The only read path to other members. Enforces community wall, mode wall, block lists and verified-only in SQL. Never query public.profiles directly for someone else.';

-- ── preview_profiles (Decision #19) ───────────────────────────────────────────
-- What a support-only member sees in their Preview Drop. Redaction happens HERE,
-- in SQL, not in the client: a blurred image with the real name in the payload
-- would not be a redaction at all.
--
-- Visible: age band, distance bucket, intention. Hidden: name, exact age, exact
-- distance, bio, prompts, condition, clear photo path.
create view public.preview_profiles
with (security_invoker = true) as
select
  p.id,
  public.age_band(p.birthdate) as age_band,
  p.intention,
  public.distance_bucket_mi(viewer.location, p.location) as distance_bucket_mi
from public.profiles p
cross join lateral (
  select location from public.profiles where id = (select auth.uid())
) viewer
where p.id <> (select auth.uid())
  and p.mode = 'dating'
  and p.verification_status = 'verified'
  and not public.is_blocked_either_way((select auth.uid()), p.id)
  and exists (
    select 1 from public.profiles v
    where v.id = (select auth.uid())
      -- Preview is a support-only surface by construction.
      and v.mode = 'support_only'
      and v.verification_status = 'verified'
      and (
        v.community = p.community
        or (v.cross_community_opt_in and p.cross_community_opt_in)
      )
  );

comment on view public.preview_profiles is
  'Preview Drop projection for support-only members. Name and exact location are redacted server-side.';

-- ── photo access ──────────────────────────────────────────────────────────────
-- Which photo path a viewer is entitled to. A member on blurred-until-connected
-- only yields their clear path once an accepted connect exists between the two.
create or replace function public.has_accepted_connect(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.connects c
    where c.status = 'accepted'
      and ((c.initiator_id = a and c.target_id = b) or (c.initiator_id = b and c.target_id = a))
  );
$$;

create view public.visible_profile_photos
with (security_invoker = true) as
select
  ph.user_id,
  ph.position,
  case
    when p.photo_privacy = 'clear'
      or public.has_accepted_connect((select auth.uid()), ph.user_id)
    then ph.storage_path
    else ph.blurred_path
  end as storage_path,
  (
    p.photo_privacy = 'blurred_until_connected'
    and not public.has_accepted_connect((select auth.uid()), ph.user_id)
  ) as is_blurred
from public.profile_photos ph
join public.profiles p on p.id = ph.user_id
where public.can_view_profile(
  (select auth.uid()),
  p.id,
  p.community,
  p.cross_community_opt_in,
  p.mode,
  p.verification_status
);

comment on view public.visible_profile_photos is
  'Resolves photo privacy server-side. A blurred-until-connected member never has their clear path leave the database before a connect is accepted.';
