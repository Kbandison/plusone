-- Row-level security is row-level. The grant decides columns.
--
-- Every policy in this schema scopes rows correctly, and `grant select, insert,
-- update on public.profiles to authenticated` then handed every member all 26
-- columns of every row their policy let them reach. Verified behaviourally
-- against the live database — each of these ran green as a normal member:
--
--   · UPDATE profiles SET verification_status='verified' WHERE id=<self>
--     Liveness skipped entirely. Verification is the wall the product rests on
--     (§5.3): discovery requires it, connects require it, and the whole pitch
--     against Positive Singles is that there are no fake profiles here.
--   · SELECT birthdate, location FROM profiles
--     Exact date of birth and a home coordinate at ~1.1km, for every member in
--     your pool. tables.sql says of location "It is NEVER exposed".
--   · UPDATE profile_photos SET storage_path='<victim>/<their>.webp'
--     The blurred path is public to anyone who can see the profile, and the
--     clear path is the same string minus "-blurred". Point your own row at it
--     and the server signs the victim's clear photo with the secret key.
--
-- The last one is worth stating plainly: 20260815000400 closed the photo view
-- and asserted the invariant "never select blurred_path and storage_path
-- together". That was the wrong invariant. The clear path was never a secret to
-- be withheld — it is derivable — so the fix has to be that a path a member
-- does not own cannot be stored in the first place.
--
-- The pattern in all three: a wall written once, in the place walls are usually
-- written, and then handed round the side by a grant nobody re-read.

-- ── profiles: columns a member may read ──────────────────────────────────────
revoke select, insert, update on public.profiles from authenticated;

-- Everything except birthdate and location. Age and distance are still
-- available — through the views, which band and bucket them.
grant select (
  id, display_name, gender, seeking, community, condition, u_equals_u,
  cross_community_opt_in, intention, intention_changed_at, mode,
  mode_dating_reentry_at, search_radius_mi, timezone, bio, prompts,
  photo_privacy, verification_status, verified_at, liveness_passed_at,
  last_active_at, onboarded_at, created_at, updated_at
) on public.profiles to authenticated;

-- ── profiles: columns a member may write ─────────────────────────────────────
-- Absent by design: verification_status, verified_at and liveness_passed_at
-- (the liveness provider decides those, through the service client); mode and
-- mode_dating_reentry_at (switch_mode owns the 30-day re-entry cooldown);
-- intention and intention_changed_at (change_intention owns the 30-day
-- cooldown); last_active_at (a Drop weight — writing it is bidding on your own
-- ranking); and id, created_at, updated_at.
--
-- A cooldown enforced in an RPC while the column stays writable is not a
-- cooldown, it is a suggestion with a nice error message.
grant update (
  display_name, birthdate, gender, seeking, community, condition, u_equals_u,
  cross_community_opt_in, location, search_radius_mi, timezone, bio, prompts,
  photo_privacy, onboarded_at
) on public.profiles to authenticated;

grant insert (
  id, display_name, birthdate, gender, seeking, community, condition,
  u_equals_u, cross_community_opt_in, location, search_radius_mi, timezone,
  bio, prompts, photo_privacy, onboarded_at
) on public.profiles to authenticated;

-- ── the views become the only way to another member's age or distance ────────
-- Both computed age from birthdate and distance from location, and both ran
-- security_invoker — so revoking those two columns above would have broken
-- them. They become definer, exactly as visible_profile_photos did in
-- 20260815000400, and for the same reason: the view is the authority.
--
-- Safe because each already carries the full wall in its own WHERE. The RLS
-- policy they used to lean on says i_can_view(...) and visible_profiles says
-- i_can_view(...) — the same predicate, plus an exclusion of your own row.
--
-- security_barrier so a caller-supplied qual cannot be evaluated ahead of that
-- WHERE. Without it a definer view can be asked leading questions.
alter view public.visible_profiles set (security_invoker = false, security_barrier = true);
alter view public.preview_profiles set (security_invoker = false, security_barrier = true);
alter view public.visible_profile_photos set (security_barrier = true);

-- ── your own row, in full ────────────────────────────────────────────────────
-- Column grants are per role, not per row, so revoking birthdate above took it
-- from the member's own profile too. This gives it back for exactly one row.
create or replace function public.my_profile()
returns setof public.profiles
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select * from public.profiles where id = (select auth.uid());
$$;

comment on function public.my_profile() is
  'The caller''s own profile row, all columns. The only way back to birthdate and location.';

revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

-- ── a photo path a member does not own cannot be stored ──────────────────────
-- The storage policies pinned this prefix (20260814000400) but the table did
-- not, and the table is what the app trusts: ownPhotos signs whatever string
-- sits in the row, with the service client, which bypasses storage RLS.
alter table public.profile_photos
  add constraint profile_photos_paths_are_owned check (
    storage_path like user_id::text || '/%'
    and blurred_path like user_id::text || '/%'
  );

comment on constraint profile_photos_paths_are_owned on public.profile_photos is
  'Both paths live under the owner''s prefix. The clear path is derivable from the blurred one, so the forgery this blocks needs no secret.';

-- ── app_config no longer names the moderators ────────────────────────────────
-- The policy is `using (true)` because members hot-read the tunables, which is
-- fine — most are published in the FAQ. updated_by is not a tunable. It is the
-- uuid of every moderator who ever changed a setting, and is_admin() was made
-- argument-less in 20260814001000 specifically so the roster could not be
-- probed. This was the roster, in a column, behind a policy that says true.
revoke select on public.app_config from authenticated;
grant select (key, value, updated_at) on public.app_config to authenticated;

-- ── two policies still called the revoked is_admin(uuid) ─────────────────────
-- 20260814001000 revoked that overload; 20260815000100 fixed moderation_queue
-- and these two were missed. A policy calling a function the querying role
-- cannot execute fails closed, so admins simply could not read the roster.
drop policy if exists "admins write config" on public.app_config;
create policy "admins write config"
  on public.app_config for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins read the admin roster" on public.admin_users;
create policy "admins read the admin roster"
  on public.admin_users for select to authenticated
  using (public.is_admin());

-- ── the guard that was supposed to catch that ────────────────────────────────
-- 20260815000100 added a DO block matching `is_admin\s*\(\s*\(?\s*select`. `~`
-- is case-sensitive and pg_policies.qual deparses with an uppercase SELECT, so
-- it never matched anything and raised nothing while two live instances sat
-- there. A guard that cannot fail is worse than no guard: it reads as coverage.
do $$
declare
  v_bad text;
begin
  select string_agg(format('%s on %s.%s', policyname, schemaname, tablename), ', ')
  into v_bad
  from pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~* 'is_admin\s*\(\s*[^)\s]'; -- any argument at all

  if v_bad is not null then
    raise exception 'policies call an is_admin overload that end users cannot execute: %', v_bad;
  end if;
end;
$$;

-- ── functions that survived only on the default PUBLIC grant ─────────────────
-- Postgres grants EXECUTE on new functions to PUBLIC, and 20260813000700's
-- `revoke all ... from anon, authenticated` did not touch that — the mirror of
-- the mistake 20260814000900 was written to fix. These four are load-bearing
-- inside the rooms, messages and voice-note policies, so they were one
-- `revoke ... from public` away from taking messaging down, and meanwhile any
-- unauthenticated caller could read the whole config table.
revoke all on function public.tunable_config() from public, anon;
grant execute on function public.tunable_config() to authenticated;

revoke all on function public.viewer_community() from public, anon;
grant execute on function public.viewer_community() to authenticated;

revoke all on function public.chat_accepts_messages(uuid) from public, anon;
grant execute on function public.chat_accepts_messages(uuid) to authenticated;

revoke all on function public.config_int(text, integer) from public, anon;
grant execute on function public.config_int(text, integer) to authenticated;
