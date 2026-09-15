-- Seeded accounts leave the members list.
--
-- Twenty of the twenty-eight rows on /admin/members are `%@seed.plusone.invalid`
-- — fabricated people who exist so the screens have something in them. A list
-- headed "Members" that is three-quarters fiction cannot answer the question
-- somebody opens it to ask.
--
-- ── excluded, not hidden, and the difference matters ───────────────────────
--
-- `check:seed` FAILS while any seeded member exists: they live in the
-- production database because there is only one, and the gate is what remembers
-- to remove them. So their existence is a real fact about the system and a
-- launch blocker, not noise to bury — which is why `admin_seeded_count()` comes
-- with this, and the screen says how many are being left out.
--
-- When they are finally deleted the count is zero and the sentence disappears
-- on its own. Nothing has to be remembered.

drop function if exists public.admin_member_roster();

create function public.admin_member_roster()
returns table (
  user_id uuid,
  display_name text,
  verification_status public.verification_status,
  created_at timestamptz,
  last_active_at timestamptz,
  joined_in_beta boolean,
  open_reports bigint,
  email_masked text,
  phone_masked text,
  metro text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with centroid (id, lat, lng) as (
    values
      ('atlanta', 33.75, -84.39),
      ('austin', 30.27, -97.74),
      ('baltimore', 39.29, -76.61),
      ('birmingham', 33.52, -86.8),
      ('boston', 42.36, -71.06),
      ('charlotte', 35.23, -80.84),
      ('chicago', 41.88, -87.63),
      ('cleveland', 41.5, -81.69),
      ('columbus', 39.96, -82.99),
      ('dallas', 32.78, -96.8),
      ('denver', 39.74, -104.99),
      ('detroit', 42.33, -83.05),
      ('houston', 29.76, -95.37),
      ('indianapolis', 39.77, -86.16),
      ('jacksonville', 30.33, -81.66),
      ('kansas-city', 39.1, -94.58),
      ('las-vegas', 36.17, -115.14),
      ('los-angeles', 34.05, -118.24),
      ('memphis', 35.15, -90.05),
      ('miami', 25.76, -80.19),
      ('milwaukee', 43.04, -87.91),
      ('minneapolis', 44.98, -93.27),
      ('nashville', 36.16, -86.78),
      ('new-orleans', 29.95, -90.07),
      ('new-york', 40.71, -74.01),
      ('oklahoma-city', 35.47, -97.52),
      ('orlando', 28.54, -81.38),
      ('philadelphia', 39.95, -75.17),
      ('phoenix', 33.45, -112.07),
      ('pittsburgh', 40.44, -80.0),
      ('portland', 45.52, -122.68),
      ('raleigh', 35.78, -78.64),
      ('richmond', 37.54, -77.44),
      ('sacramento', 38.58, -121.49),
      ('salt-lake-city', 40.76, -111.89),
      ('san-antonio', 29.42, -98.49),
      ('san-diego', 32.72, -117.16),
      ('san-francisco', 37.77, -122.42),
      ('seattle', 47.61, -122.33),
      ('st-louis', 38.63, -90.2),
      ('tampa', 27.95, -82.46),
      ('washington', 38.91, -77.04)
  )
  select
    p.id,
    p.display_name,
    p.verification_status,
    p.created_at,
    p.last_active_at,
    p.joined_in_beta,
    (select count(*) from public.moderation_queue m
      where m.subject_user_id = p.id and m.status = 'open'),
    case when u.email is null then null
         else left(split_part(u.email, '@', 1), 2) || '***@' || split_part(u.email, '@', 2)
    end,
    case when u.phone is null then null else '***' || right(u.phone, 4) end,
    -- Nearest centroid within 75 miles, or nothing. ST_Distance on geography
    -- returns metres; 120701 is 75 miles.
    --
    -- extensions.* throughout: PostGIS lives in the `extensions` schema, not
    -- public, and this function pins search_path to public — so an unqualified
    -- `geography` does not resolve. round_location() qualifies for the same
    -- reason; the first version of this did not and failed on apply with
    -- "type geography does not exist".
    (
      select c.id from centroid c
       where p.location is not null
         and extensions.ST_Distance(p.location,
               extensions.ST_SetSRID(extensions.ST_MakePoint(c.lng, c.lat), 4326)::extensions.geography) <= 120701
       order by extensions.ST_Distance(p.location,
               extensions.ST_SetSRID(extensions.ST_MakePoint(c.lng, c.lat), 4326)::extensions.geography)
       limit 1
    )
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_admin()
    -- The same predicate remove-test-members.mjs deletes on, so the list and
    -- the cleanup cannot disagree about what a seeded account is.
    and (u.email is null or u.email not like '%@seed.plusone.invalid')
  order by p.created_at desc
  limit 200;
$$;

revoke all on function public.admin_member_roster() from public, anon;
grant execute on function public.admin_member_roster() to authenticated;

comment on function public.admin_member_roster() is
  'Admin: who has signed up, when, and which metro their rounded location falls in. Seeded accounts are excluded — admin_seeded_count() says how many. The metro is DERIVED on read; centroids are generated from METROS and pinned by a test.';

/**
 * How many seeded accounts are being left out of that list.
 *
 * Not a curiosity: `check:seed` refuses to pass while this is above zero, so it
 * is the number standing between here and launch. Shown on the members screen
 * because that is where somebody is already looking at the gap it explains.
 */
create or replace function public.admin_seeded_count()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when public.is_admin() then
    (select count(*)::integer from auth.users u
      where u.email like '%@seed.plusone.invalid')
  else 0 end;
$$;

revoke all on function public.admin_seeded_count() from public, anon;
grant execute on function public.admin_seeded_count() to authenticated;

comment on function public.admin_seeded_count() is
  'How many seeded accounts exist. Zero is the launch condition check:seed enforces.';
