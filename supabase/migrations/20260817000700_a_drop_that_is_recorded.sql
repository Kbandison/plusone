-- The Drop was never stored, so three mechanics that read it were dead.
--
-- getTonightsDrop wrote the served ids with the MEMBER's client, but
-- public.drops grants only `select` to authenticated and its RLS has a SELECT
-- policy and nothing else — the comment there says "Drops are written by the
-- cron job under the service key only". No such cron exists: vercel.json
-- registers fuse-sweep, connect-sweep, purge, referral-rewards and
-- fuse-warning, and nothing in the repo writes this table. So the insert failed
-- with 42501 on every call, and the result was never destructured for an error.
--
-- What that broke, silently:
--   - Decision #15's free drop-connect, which validates source='drop' against
--     drops.served_profile_ids (20260815001100). No row, no free connect, ever.
--   - Re-opening the app re-rolled a whole new Drop instead of returning the
--     same one, because the "already served today" read found nothing.
--   - times_served/underexposure, which counts appearances in drops.
--
-- A definer RPC rather than the cron the comment imagines: the Drop is assembled
-- when the member opens the app, so the writer has to be the request that
-- assembled it. The member supplies nothing that is not already theirs — the
-- row is keyed on auth.uid(), and ON CONFLICT DO NOTHING means two tabs racing
-- settle on one Drop rather than two.
create or replace function public.record_drop(
  p_drop_date date,
  p_served_profile_ids uuid[],
  p_radius_used_mi integer,
  p_is_preview boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- Today or yesterday only. A caller cannot backfill history to manufacture a
  -- free drop-connect to somebody they were never served.
  if p_drop_date > (now() at time zone 'utc')::date
     or p_drop_date < (now() at time zone 'utc')::date - 1 then
    raise exception 'a drop is for today' using errcode = '22023';
  end if;

  insert into public.drops (user_id, drop_date, served_profile_ids, radius_used_mi, is_preview)
  values (v_uid, p_drop_date, p_served_profile_ids, p_radius_used_mi, p_is_preview)
  on conflict (user_id, drop_date) do nothing;
end;
$$;

revoke all on function public.record_drop(date, uuid[], integer, boolean) from public, anon;
grant execute on function public.record_drop(date, uuid[], integer, boolean) to authenticated;
