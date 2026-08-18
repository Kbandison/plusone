-- Somewhere to measure from.
--
-- `profiles.location` has existed since the first migration. round_location()
-- coarsens it to ~1km, a trigger applies that on every write, distance_mi()
-- computes from it, visible_profiles exposes the result, and both Browse and
-- the Drop filter on it.
--
-- Nothing has ever written one. A grep of the whole application for `location`
-- returns the Next router and nothing else.
--
-- So distance_mi is null for every member against every other member, and
-- `distance_mi <= radius` is null — which is not true. Browse returns nothing.
-- drop_candidates returns nothing. Every wall, every score and every filter
-- downstream of them has been operating on an empty set, and the whole thing
-- reads as "nobody is near you yet" rather than as a missing write.
--
-- The column is in the members' update grant, but writing a geography through
-- PostgREST means handing it a string and hoping it casts. This takes two
-- numbers instead, checks them, and lets the trigger do the rounding — so
-- nowhere in the app has to know what SRID means or remember to coarsen.
create function public.set_my_location(p_lat double precision, p_lon double precision)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- A refused browser prompt and a broken one both arrive as nothing useful,
  -- and 0,0 is in the Atlantic. Out of range is dropped rather than stored:
  -- a wrong location is worse than none, because none reads as "no matches
  -- near you" and wrong reads as a match six thousand miles away.
  if p_lat is null or p_lon is null
     or p_lat < -90 or p_lat > 90
     or p_lon < -180 or p_lon > 180 then
    raise exception 'that is not a place' using errcode = '22023';
  end if;

  -- No rounding here: profiles_round_location does it on write, so there is one
  -- definition of "coarse" and it is the one §12 names.
  update public.profiles
     set location = extensions.ST_SetSRID(
           extensions.ST_MakePoint(p_lon, p_lat), 4326
         )::extensions.geography
   where id = v_uid;
end;
$$;

grant execute on function public.set_my_location(double precision, double precision) to authenticated;
