-- Two things the product promised and the database did not do.
--
-- ── slow mode ─────────────────────────────────────────────────────────────────
-- postToRoom's own docstring says "Slow mode is enforced by the database.
-- Checking it here as well would be a second clock, and two clocks disagree",
-- and so the action checks nothing. The database checked nothing either:
-- slow_mode_seconds appears in the column, its range constraint, the seed values,
-- and two lines of the room page that DISPLAY it. No trigger, no RPC check, no
-- policy term. Every room advertised a cooldown that did not exist, and
-- room_messages_user_recent_ix was built for exactly this and used by nothing.
create or replace function public.enforce_room_slow_mode()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seconds integer;
  v_last timestamptz;
begin
  select r.slow_mode_seconds into v_seconds from public.rooms r where r.id = new.room_id;
  if coalesce(v_seconds, 0) <= 0 then
    return new;
  end if;

  select max(m.created_at) into v_last
    from public.room_messages m
   where m.room_id = new.room_id
     and m.user_id = new.user_id;

  if v_last is not null and now() < v_last + make_interval(secs => v_seconds) then
    -- The remaining wait, not the room's setting: a member who has waited most
    -- of it should be told what is left.
    raise exception 'slow mode: wait % more seconds',
      ceil(extract(epoch from (v_last + make_interval(secs => v_seconds) - now())))::integer
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists room_messages_slow_mode on public.room_messages;
create trigger room_messages_slow_mode
  before insert on public.room_messages
  for each row execute function public.enforce_room_slow_mode();

-- ── the Preview Drop was showing clear photographs ────────────────────────────
-- Decision #19 and §6.1 step 5 both specify BLURRED photos for the Preview Drop.
-- The page called photosFor() for both variants, and that reads
-- visible_profile_photos, whose CASE keys on photo_privacy and
-- i_have_connected_with() and knows nothing about the viewer's mode.
-- photo_privacy defaults to 'clear', and can_view_profile's mode wall passes any
-- target for a support-only viewer — so preview_profiles correctly returned only
-- an age band, an intention and a distance bucket, and the card rendered them
-- above a fully identifiable photograph.
--
-- A view of its own, so the preview branch cannot reach a clear object at all:
-- there is no column here that could carry one.
create or replace view public.preview_profile_photos
with (security_invoker = false, security_barrier = true)
as
  select
    ph.user_id,
    ph.id,
    ph.position,
    ph.blurred_path as path,
    true as is_blurred
  from public.profile_photos ph
  join public.profiles viewer on viewer.id = (select auth.uid())
  where
    -- Only a support-only viewer sees a preview at all (Decision #19).
    viewer.mode = 'support_only'
    and public.preview_permitted(ph.user_id)
    and ph.blurred_path is not null;

revoke all on public.preview_profile_photos from public, anon;
grant select on public.preview_profile_photos to authenticated;

comment on view public.preview_profile_photos is
  'Blurred variants only, for the support-only Preview Drop (Decision #19). '
  'Has no column that could return a clear path.';
