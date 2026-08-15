-- `visible_profile_photos` has never returned another member's photo.
--
-- It is security_invoker, so the underlying `profile_photos` policy applies —
-- and that policy is own-rows-only. The view was written to be THE path to
-- other members' photos, resolving blurred-until-connected server-side, and the
-- RLS underneath it made that impossible. It returned nothing but your own.
--
-- Which means Decision #19 has not been working. Nothing was leaked — the
-- failure is closed, and no surface rendered photos until now — but the
-- mechanic was decorative.
--
-- THE OBVIOUS FIX IS THE WRONG ONE. Adding a `profile_photos` select policy for
-- members you can see would make the view work, and would also let anyone query
-- `profile_photos` directly and read BOTH storage_path and blurred_path. The
-- clear path of someone who chose blurred-until-connected would be one query
-- away. That is precisely what Decision #19 exists to prevent.
--
-- So the view becomes the authority instead: SECURITY DEFINER, doing its own
-- authorisation with i_can_view(), and exposing only the variant it chose.
-- `profile_photos` stays own-rows-only, so the direct path still cannot see
-- anyone else's paths at all.
--
-- This is the ONLY definer view in the schema, and it earns it by being the
-- thing that decides. The other two are projections over data the caller could
-- already read, and stay invoker.

alter view public.visible_profile_photos set (security_invoker = false);

comment on view public.visible_profile_photos is
  'The only path to another member''s photo. SECURITY DEFINER because profile_photos is own-rows-only: this view does its own authorisation and returns one resolved variant, never both paths.';

-- A definer view runs as its owner, so the grant is the whole of who may read
-- it. Members may; anon may not.
revoke all on public.visible_profile_photos from anon;
grant select on public.visible_profile_photos to authenticated;

-- Belt and braces on the thing that matters: whatever else changes, a caller
-- must never be able to select blurred_path and storage_path together for
-- somebody else. That is a property of the profile_photos policy, and it is
-- asserted in pnpm check:photos rather than assumed here.
