-- The same problem as 20260814000100, one step earlier.
--
-- §7.2 runs liveness BEFORE profile basics, so a liveness result needs somewhere
-- to live before a member has typed a name. display_name and birthdate were the
-- last NOT NULLs standing in the way of a profile row existing from the moment
-- someone signs in.
--
-- Rather than scatter partial state across side tables, a profile row is now
-- created at sign-up and filled in as onboarding proceeds. Every step becomes an
-- UPDATE, which is simpler than an upsert per screen and means `verification_status`
-- has a home from the start.
--
-- The invariant does not move: a VERIFIED profile is a complete one, and nothing
-- unverified is ever visible.

alter table public.profiles
  alter column display_name drop not null,
  alter column birthdate drop not null;

alter table public.profiles
  drop constraint profiles_complete_when_verified;

alter table public.profiles
  add constraint profiles_complete_when_verified check (
    verification_status <> 'verified'
    or (
      display_name is not null
      and birthdate is not null
      and community is not null
      and condition is not null
      and intention is not null
    )
  );

comment on constraint profiles_complete_when_verified on public.profiles is
  'A visible profile is a complete one. Unfinished onboarding is never verified.';

-- profiles_adult and profiles_display_name_len both survive untouched: a CHECK
-- passes when its expression is NULL, so a fresh row satisfies them and a filled
-- one is constrained exactly as before. pnpm check:db evaluates this against the
-- catalogue's own constraint text rather than taking the comment's word for it.

-- ── the row itself ────────────────────────────────────────────────────────────
-- Created by trigger rather than by the app, so it cannot be forgotten on a code
-- path that signs someone in without going through onboarding.
create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.create_profile_for_new_user() is
  'Gives every auth user an empty profile row so onboarding has somewhere to write.';

drop trigger if exists create_profile_on_signup on auth.users;

create trigger create_profile_on_signup
  after insert on auth.users
  for each row
  execute function public.create_profile_for_new_user();
