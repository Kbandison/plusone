-- Which metro a member is in, derived rather than asked.
--
-- Kevin: "why don't we use the browser location to infer that and slot them in
-- their metro?" For members the answer is that we already have the location and
-- were simply never using it — nothing in the app asks a member for a metro,
-- and nothing showed one either. The waitlist asks because a non-member has no
-- account, no granted location, and a table that may not hold coordinates.
--
-- ── derived on read, so nothing new is stored ──────────────────────────────
--
-- No column on profiles. A stored metro would be new personal data: a privacy
-- classification, two store data-safety forms, a backfill, and a second copy to
-- keep in step with a location the member can change. `profiles.location` is
-- already there, already rounded to ~1km by round_location(), and a centroid
-- lookup is cheap. Computed here, held nowhere.
--
-- ── the centroids are duplicated, and a test refuses drift ─────────────────
--
-- METROS lives in packages/config and cannot be reached from SQL. These values
-- were GENERATED from it rather than transcribed, and waitlist.test.ts fails if
-- the two ever disagree — the same arrangement privacy-labels and
-- play-data-safety already have. Two copies with a gate beats one copy that the
-- database cannot see.
--
-- ── null rather than a guess ───────────────────────────────────────────────
--
-- Beyond METRO_NEAREST_MI of every centroid the answer is null, not "elsewhere".
-- A centroid is a city hall, not a boundary, so past a certain distance the
-- honest answer is that this member is not in a metro we serve — and a roster
-- that says "elsewhere" for somebody 300 miles out reads as a category rather
-- than as an absence.

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
  order by p.created_at desc
  limit 200;
$$;

revoke all on function public.admin_member_roster() from public, anon;
grant execute on function public.admin_member_roster() to authenticated;

comment on function public.admin_member_roster() is
  'Admin: who has signed up, when, and which metro their rounded location falls in. The metro is DERIVED on read — no column, no new stored data. Centroids are generated from METROS and pinned by a test.';
