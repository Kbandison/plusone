-- Thanking the people who were here first, and one home for the centroids.
--
-- BACKLOG 29. `is_premium()` already unions `premium_grants`, so a thank-you is
-- an insert — no store involved, nothing to reconcile with Apple or Google.
--
-- ── dated, and starting when their metro opens ─────────────────────────────
--
-- Kevin's call. `premium_grants.expires_at` is NOT NULL, so the table only
-- expresses a dated grant anyway; what was open was WHEN it starts. A grant
-- running from signup is spent while there is nobody nearby to spend it on —
-- premium is reach and filters, and a tester whose area holds four people gets
-- nothing from either.
--
-- So there is no "metro opened" record and no scheduled job. THE ACT OF
-- GRANTING IS THE OPENING: Kevin runs it for a metro when that metro is worth
-- being in, which is a judgement no column can hold.
--
-- ── metro_for, because this is the third caller ────────────────────────────
--
-- 20260912000400 put the centroids inside admin_member_roster. This needs the
-- same lookup, and a second copy is how two screens start disagreeing about
-- where somebody lives. They move into `metro_for` and the roster calls it.
-- Still generated from METROS rather than typed, still pinned by a test.

create or replace function public.metro_for(p_location extensions.geography)
returns text
language sql
stable
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
  select c.id from centroid c
   where p_location is not null
     and extensions.ST_Distance(p_location,
           extensions.ST_SetSRID(extensions.ST_MakePoint(c.lng, c.lat), 4326)::extensions.geography)
         <= 120701
   order by extensions.ST_Distance(p_location,
           extensions.ST_SetSRID(extensions.ST_MakePoint(c.lng, c.lat), 4326)::extensions.geography)
   limit 1;
$$;

comment on function public.metro_for(extensions.geography) is
  'Nearest metro centroid within 75 miles, or null. Centroids are generated from METROS and pinned by a test. Null rather than "elsewhere": a centroid is a city hall, not a boundary.';

/**
 * Who is owed a thank-you, and where. Nothing is granted by looking.
 */
create or replace function public.admin_beta_thanks_pending()
returns table (metro text, waiting integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.metro_for(p.location), count(*)::integer
    from public.profiles p
    join auth.users u on u.id = p.id
   where public.is_admin()
     and p.joined_in_beta
     and (u.email is null or u.email not like '%@seed.plusone.invalid')
     and not exists (
       select 1 from public.premium_grants g
        where g.user_id = p.id and g.source = 'beta_thanks'
     )
   group by 1
   order by 2 desc;
$$;

revoke all on function public.admin_beta_thanks_pending() from public, anon;
grant execute on function public.admin_beta_thanks_pending() to authenticated;

/**
 * Grant it, for one metro.
 *
 * Per metro rather than all at once, because the whole point is that it starts
 * when THAT area is worth being in. A single button for everybody would put the
 * grant back at signup, which is the thing this design rejects.
 *
 * The default is BETA_THANKS_MONTHS, and a test pins the two equal. The reason
 * it is three rather than one or six is argued where the constant lives.
 */
create or replace function public.admin_grant_beta_thanks(
  p_metro text,
  p_months integer default 3
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_granted integer;
begin
  if not public.is_admin() then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_months < 1 or p_months > 24 then
    raise exception 'a thank-you runs between one and twenty-four months'
      using errcode = '22023';
  end if;

  with owed as (
    select p.id
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.joined_in_beta
       -- `is not distinct from`, so null matches null. A member with no
       -- location has no metro, and `= null` would leave them permanently
       -- listed as owed and permanently ungrantable — a pending row with no
       -- button, which is worse than not listing them at all.
       and public.metro_for(p.location) is not distinct from p_metro
       -- A seeded account is not a person and must not hold a grant. Same
       -- predicate remove-test-members.mjs deletes on.
       and (u.email is null or u.email not like '%@seed.plusone.invalid')
       -- Idempotent: running it twice for one metro grants nobody twice, which
       -- matters because the only way to know it worked is to run it.
       and not exists (
         select 1 from public.premium_grants g
          where g.user_id = p.id and g.source = 'beta_thanks'
       )
  )
  insert into public.premium_grants (user_id, source, expires_at)
  select owed.id, 'beta_thanks', now() + make_interval(months => p_months)
    from owed;

  get diagnostics v_granted = row_count;
  return v_granted;
end;
$$;

revoke all on function public.admin_grant_beta_thanks(text, integer) from public, anon;
grant execute on function public.admin_grant_beta_thanks(text, integer) to authenticated;

comment on function public.admin_grant_beta_thanks(text, integer) is
  'Grants a dated premium thank-you to beta joiners in one metro. Idempotent on source = beta_thanks. Seeded accounts never receive one.';

-- The roster gives up its private copy of the centroids.
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
    -- The shared lookup, so the roster and the thank-you cannot disagree about
    -- where somebody lives. The centroids were inline here until 20260914000200
    -- and moved the moment a second caller wanted them.
    public.metro_for(p.location)
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
