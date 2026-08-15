-- Every surface renders a photo at 72px or less, and we were serving 1600px.
--
-- The obvious answer is an image optimiser, and it is the wrong one here. The
-- bytes behind a photo URL differ by viewer — blurred for a stranger, clear for
-- someone who has connected — and Vercel's optimiser caches by URL. The first
-- connected viewer would populate a cache entry that a stranger then reads.
-- That is a worse leak than the bandwidth it saves, and it would defeat
-- Decision #19 through the CDN rather than through the database.
--
-- Optimising also meant every photo travelled as
-- GET /_next/image?url=<full signed URL>, putting a live ten-minute credential
-- to a member's photo into our own access logs and a CDN cache key, where §9.6
-- wants opaque ids only.
--
-- So the browser fetches Supabase directly, and a card-sized variant is stored
-- at upload to make that affordable. The 1600px original stays for a
-- full-screen view when one is built.

alter table public.profile_photos add column if not exists card_path text;

comment on column public.profile_photos.card_path is
  'The 320px variant every surface actually renders. Nullable so a photo uploaded before this column still resolves — the view falls back to storage_path.';

-- The path constraint has to cover it too. Same reasoning as
-- 20260815000800: a path a member does not own must not be storable, and the
-- card path is derivable from the blurred one exactly like the clear one is.
alter table public.profile_photos drop constraint if exists profile_photos_paths_are_owned;
alter table public.profile_photos
  add constraint profile_photos_paths_are_owned check (
    storage_path like user_id::text || '/%'
    and blurred_path like user_id::text || '/%'
    and (card_path is null or card_path like user_id::text || '/%')
  );

-- The view keeps deciding which variant, and now hands back the small one.
--
-- Rebuilt from the 20260814001000 body, NOT the original: that migration moved
-- it onto the self-relative predicates (i_can_view, i_have_connected_with), and
-- rebuilding from the older text would quietly put the two-argument versions
-- back. Same shape, one CASE, one column — it still never returns both paths.
create or replace view public.visible_profile_photos
with (security_invoker = false, security_barrier = true) as
select
  ph.user_id,
  ph.position,
  case
    when p.photo_privacy = 'clear'
      or public.i_have_connected_with(ph.user_id)
    then coalesce(ph.card_path, ph.storage_path)
    else ph.blurred_path
  end as storage_path,
  (
    p.photo_privacy = 'blurred_until_connected'
    and not public.i_have_connected_with(ph.user_id)
  ) as is_blurred
from public.profile_photos ph
join public.profiles p on p.id = ph.user_id
where public.i_can_view(p.id, p.community, p.cross_community_opt_in, p.mode, p.verification_status);

comment on view public.visible_profile_photos is
  'The only path to another member''s photo. SECURITY DEFINER because profile_photos is own-rows-only: this view does its own authorisation and returns one resolved variant, never both paths. It returns the card-sized object, because nothing renders a photo larger than that.';

revoke all on public.visible_profile_photos from anon;
grant select on public.visible_profile_photos to authenticated;
