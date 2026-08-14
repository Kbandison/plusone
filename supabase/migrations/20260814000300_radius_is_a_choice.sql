-- search_radius_mi carried `not null default 50`, which made "the member has
-- chosen a radius" and "the member has not reached that screen yet"
-- indistinguishable — a fresh row already looked answered, so the §7.2 radius
-- step would never render.
--
-- The default was doing two jobs: expressing a sensible starting value, and
-- standing in for an answer. It keeps the first and loses the second. Null now
-- means "not chosen"; RADIUS.defaultMi in packages/config supplies the 50 when
-- reading, which is where the number already lived.

alter table public.profiles
  alter column search_radius_mi drop default,
  alter column search_radius_mi drop not null;

-- profiles_radius_range survives untouched: a CHECK passes when its expression
-- is NULL, so an unanswered radius is allowed and a chosen one is still held to
-- 5..250.

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
      and search_radius_mi is not null
    )
  );

comment on constraint profiles_complete_when_verified on public.profiles is
  'A visible profile is a complete one. Unfinished onboarding is never verified.';
