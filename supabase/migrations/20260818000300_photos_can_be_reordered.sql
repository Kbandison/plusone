-- Reordering photos, and choosing which one is the main.
--
-- `position` has always decided both: every card, every drop and every profile
-- reads the lowest one, so position 0 IS the main photo. Nothing could change
-- it. A member whose best picture went up third had no way to promote it, and
-- no way to reorder at all.
--
-- The obstacle is `unique (user_id, position)` and it is not incidental.
-- Reordering is a PERMUTATION — every sensible one moves a photo onto a number
-- another photo currently holds — and a non-deferrable unique constraint is
-- checked row by row as the UPDATE walks, so the swap collides halfway through
-- its own statement. Widening the range to park rows somewhere temporary is not
-- open either: profile_photos_position_range CHECKs 0..5 and that ceiling is
-- the product rule.
--
-- So the constraint becomes DEFERRABLE. Still INITIALLY IMMEDIATE — every other
-- write is checked exactly as before, including the upload path that allocates
-- the lowest free slot — and only reorder_photos defers it, for the length of
-- one statement, which is the only place a transient duplicate is correct.
alter table public.profile_photos
  drop constraint profile_photos_user_id_position_key;

alter table public.profile_photos
  add constraint profile_photos_user_id_position_key
    unique (user_id, position) deferrable initially immediate;

/*
 * Rewrites the caller's photo order from a list of ids.
 *
 * The array IS the new order: element 0 becomes position 0, which is the main
 * photo. "Make this the main one" is the same call with that id moved to the
 * front, so there is one operation here rather than three that could disagree.
 *
 * Refuses anything that is not exactly the caller's own set. A short array
 * would leave photos holding stale positions; a long one, or one naming
 * somebody else's photo, is a member reordering a stranger's profile. Both are
 * refused before a single row moves.
 */
create function public.reorder_photos(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_mine integer;
  v_given integer;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'nothing to reorder' using errcode = '22023';
  end if;

  -- Duplicates would map two positions onto one photo and silently drop
  -- another, so the count has to survive being made a set.
  select count(*) into v_given from (select distinct unnest(p_ids)) d;
  if v_given <> cardinality(p_ids) then
    raise exception 'the same photo cannot appear twice' using errcode = '22023';
  end if;

  select count(*) into v_mine from public.profile_photos where user_id = v_uid;

  if v_mine <> v_given then
    raise exception 'that is not the whole set' using errcode = '22023';
  end if;

  -- Every id must be one of theirs. Checked as a count rather than per row, so
  -- one foreign id fails the whole call.
  if (
    select count(*) from public.profile_photos
    where user_id = v_uid and id = any (p_ids)
  ) <> v_given then
    raise exception 'that is not your photo' using errcode = '42501';
  end if;

  -- The one place a transient duplicate is correct.
  set constraints public.profile_photos_user_id_position_key deferred;

  update public.profile_photos p
     set position = ordering.rank - 1
    from (select id, row_number() over (order by ord) as rank
            from unnest(p_ids) with ordinality as t(id, ord)) ordering
   where p.id = ordering.id
     and p.user_id = v_uid;
end;
$$;

grant execute on function public.reorder_photos(uuid[]) to authenticated;
