-- Per-photo privacy (PREMIUM_INCLUDES, server 18b).
--
-- `profiles.photo_privacy` is one switch over all six photos: everything clear,
-- or everything blurred until connected. "Fine-grained photo privacy controls"
-- has been sold on two public pages against that two-value enum.
--
-- Kevin's call 2026-08-29, both halves:
--
--   · PER-PHOTO rather than more audiences. A member can show a face-free shot
--     clear and keep the rest blurred, which is the thing the current control
--     cannot express at all.
--   · PAID, BUT SAFETY STAYS FREE. The profile-wide blur is untouched and
--     still free, so no member's protection is behind the paywall — anybody
--     can still blur everything. Premium buys arrangement, not safety.
--
-- That second half was put to Kevin explicitly rather than assumed, because
-- 20260818000100 and BACKLOG 16 both refuse to build things that press on the
-- people who chose to blur, on an app whose premise is that disclosure is hard.
--
-- ── the rule that is not a product decision ──────────────────────────────────
--
-- A LAPSED SUBSCRIPTION MUST NEVER MAKE A MEMBER MORE VISIBLE. So an override
-- is retained for ever and premium gates only the SETTING of one, never the
-- keeping of it. Nothing in this migration or anywhere else clears these
-- columns when premium ends, and photo-privacy.test.ts fails if anything
-- starts. Un-blurring photographs of people who are ill, silently, because a
-- card expired, is the worst failure this app could have.
alter table public.profile_photos
  add column photo_privacy public.photo_privacy;

comment on column public.profile_photos.photo_privacy is
  'Per-photo override of profiles.photo_privacy. NULL means follow the profile, which is what every existing row does and what a free member always gets. Never cleared automatically: a lapse must not make anybody more visible.';

-- ── the gate has to be here, not in the action ───────────────────────────────
--
-- 20260813000700 grants `select, insert, update, delete` on profile_photos to
-- authenticated as a WHOLE TABLE, so a member can PATCH any column on their own
-- rows straight through PostgREST. A premium check in a server action would
-- therefore be decoration: the action is not the only writer and never was.
--
-- A trigger rather than narrowing that grant to a column list. Narrowing is the
-- convention this repo otherwise follows, but it would mean enumerating every
-- column the photo flow writes today and silently breaking whichever one was
-- missed — and the failure would be an upload that stops working, not an error
-- anybody would read. The trigger refuses one specific thing and leaves the
-- rest of the table exactly as it was.
create or replace function public.enforce_photo_privacy_is_premium()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  -- Service-role writes have no auth.uid(). RLS already governs who may touch
  -- these rows; this trigger is about which SETTING a member may express.
  if v_uid is null then
    return new;
  end if;

  -- Clearing an override back to "follow the profile" is always allowed. It is
  -- the free model, and refusing it would strand a lapsed member in a state
  -- they can no longer edit.
  if new.photo_privacy is null then
    return new;
  end if;

  -- An unchanged value is not a new expression of it. Without this, a lapsed
  -- member could not reorder their photos or replace one, because any UPDATE
  -- carrying the existing override would be refused.
  if tg_op = 'UPDATE' and new.photo_privacy is not distinct from old.photo_privacy then
    return new;
  end if;

  if not public.is_premium(v_uid) then
    raise exception 'per-photo privacy is a premium setting'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_photo_privacy_is_premium() from public, anon, authenticated;

drop trigger if exists profile_photos_privacy_is_premium on public.profile_photos;
create trigger profile_photos_privacy_is_premium
  before insert or update on public.profile_photos
  for each row execute function public.enforce_photo_privacy_is_premium();

-- ── the view learns to ask the photo first ───────────────────────────────────
--
-- One coalesce, in both arms, and they must not drift: the arm that picks the
-- path and the arm that reports is_blurred have to agree, or the app renders a
-- clear photo and labels it blurred. Pinned by test.
create or replace view public.visible_profile_photos
with (security_invoker = false, security_barrier = true) as
select
  ph.user_id,
  ph.position,
  case
    when coalesce(ph.photo_privacy, p.photo_privacy) = 'clear'
      or public.i_have_connected_with(ph.user_id)
    then coalesce(ph.card_path, ph.storage_path)
    else ph.blurred_path
  end as storage_path,
  (
    coalesce(ph.photo_privacy, p.photo_privacy) = 'blurred_until_connected'
    and not public.i_have_connected_with(ph.user_id)
  ) as is_blurred
from public.profile_photos ph
join public.profiles p on p.id = ph.user_id
where public.i_can_view(p.id, p.community, p.cross_community_opt_in, p.mode, p.verification_status);

comment on view public.visible_profile_photos is
  'The only path to another member''s photo. SECURITY DEFINER because profile_photos is own-rows-only: this view does its own authorisation and returns one resolved variant, never both paths. Privacy is the photo''s own setting where it has one, and the profile''s otherwise.';

revoke all on public.visible_profile_photos from anon;
grant select on public.visible_profile_photos to authenticated;
