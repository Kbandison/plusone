-- Onboarding builds a profile across several screens (§7.2), so a row exists
-- before it is finished. The original shape assumed profiles spring into
-- existence complete, which made the basics step — the one BEFORE community and
-- condition — impossible to persist.
--
-- Rather than weaken the invariant, this moves it to where it actually matters:
-- a profile that is VERIFIED, and therefore visible to anyone, must be complete.
-- An unfinished profile is never visible, because can_view_profile() and
-- visible_profiles both require verification_status = 'verified'.

alter table public.profiles
  alter column community drop not null,
  alter column condition drop not null,
  alter column intention drop not null;

-- The invariant, restated where it counts. A verified profile has every field
-- the matching walls read; anything less cannot reach 'verified'.
alter table public.profiles
  add constraint profiles_complete_when_verified check (
    verification_status <> 'verified'
    or (community is not null and condition is not null and intention is not null)
  );

-- profiles_condition_matches_community and profiles_ueu_hiv_only both survive
-- untouched: a CHECK passes when its expression is NULL, so a half-built
-- profile satisfies them and a completed one is still constrained exactly as
-- before. Verified here rather than assumed:
--
--   community=null, condition=null           -> NULL   -> passes
--   community='hsv', condition='hiv'         -> false  -> rejected, as before
--   u_equals_u=true, community=null          -> false  -> rejected, as before

comment on constraint profiles_complete_when_verified on public.profiles is
  'A visible profile is a complete one. Unfinished onboarding is never verified.';
