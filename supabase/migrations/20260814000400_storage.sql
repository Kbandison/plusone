-- Storage buckets (§4.2).
--
--   photos               private. Member photos and their blurred variants.
--   verification-selfies private. Written by the liveness path, purged at
--                        decision time (§4.2) — never read by the app.
--
-- Both are private. There is no public bucket in this product and there should
-- never be one: a public URL is a permanent, unauthenticated link to a member's
-- face, and no amount of RLS elsewhere takes that back.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('photos', 'photos', false, 8388608,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
  ('verification-selfies', 'verification-selfies', false, 8388608,
   array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ── photos ────────────────────────────────────────────────────────────────────
-- Path convention: <user_id>/<uuid>.webp and <user_id>/<uuid>-blurred.webp.
-- The first path segment IS the owner, which is what these policies check.

create policy "own photo objects are readable"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "own photo objects are writable"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "own photo objects are replaceable"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "own photo objects are deletable"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Deliberately NO policy granting members read access to anyone else's objects.
-- Other members' photos are reached only through signed URLs minted server-side
-- after visible_profile_photos has decided which variant they may see. A select
-- policy here would be a second, weaker path to the same bytes (§5.3).

-- ── verification-selfies ──────────────────────────────────────────────────────
-- Write-only from the member's side. They can put a selfie in; they cannot read
-- it back, and neither can anyone else. The liveness path purges it at decision
-- time, so a readable object is a bug rather than a feature.

create policy "own selfie is writable"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'verification-selfies'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
