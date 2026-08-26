-- Two tables kept privileges nobody granted them.
--
-- 20260813000700 opens with `revoke all on all tables in schema public from
-- anon, authenticated` and then adds back exactly what a member session needs.
-- That statement is not standing policy — it revoked what existed in August
-- 2026 and has nothing to say about a table created afterwards. Supabase ships
-- `alter default privileges ... grant all on tables to anon, authenticated`, so
-- every NEW table arrives with the full set and has to revoke for itself.
--
-- Most later migrations do. 20260819000500 and 20260820000200 both open with a
-- revoke naming both roles. Two did not:
--
--   public.iap_entitlements       20260826000100, mine, yesterday. Neither role
--                                 revoked, so anon and authenticated both held
--                                 SELECT, INSERT, UPDATE, DELETE, REFERENCES,
--                                 TRIGGER and TRUNCATE on it.
--   public.preview_profile_photos 20260817000800 and again in 20260817001100.
--                                 Both revoke `from public, anon` and omit
--                                 authenticated, which therefore kept the lot.
--
-- Neither was reachable, and it is worth being exact about why rather than
-- calling them harmless:
--
--   · iap_entitlements has RLS on and one SELECT policy. An INSERT or UPDATE
--     with no policy to permit it is refused whatever the grant says. The grant
--     was the only thing standing between a future permissive policy and a
--     member writing their own premium entitlement — which is to say the hole
--     was one plausible policy away, not open.
--   · preview_profile_photos is a view, and not an auto-updatable one:
--     pg_relation_is_updatable reports no INSERT, UPDATE or DELETE, so Postgres
--     refuses the write before privileges are consulted. Confirmed against
--     production for all five views. It becomes live the day somebody
--     simplifies the view enough for Postgres to make it updatable, and that is
--     not a change anyone would think to check grants after.
--
-- So: revoke, then grant back the one thing each is meant to expose. The
-- outcome matches subscriptions and premium_grants, which have held exactly
-- `authenticated SELECT` since the beginning.
revoke all on public.iap_entitlements from anon, authenticated;
grant select on public.iap_entitlements to authenticated;

revoke all on public.preview_profile_photos from public, anon, authenticated;
grant select on public.preview_profile_photos to authenticated;
