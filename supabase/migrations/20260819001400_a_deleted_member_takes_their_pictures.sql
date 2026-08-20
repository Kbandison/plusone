-- Hard delete has to take room images with it.
--
-- purge_targets reads the handles on everything the cascade is about to
-- destroy, because those rows are the only way to find the storage objects
-- afterwards. Voice notes are already on that list, for exactly this reason,
-- under a comment reading: "Sweeping two buckets and not this one left an
-- unreferenced, undiscoverable recording of the voice of somebody who asked to
-- be forgotten."
--
-- A room image has the same shape of problem and one worse property: its path
-- is <room_id>/<message_id>, keyed on the room so that an anonymous post cannot
-- be traced to its author. That is the right key, and it means there is no
-- user-id folder to list — the row holding the path IS the index, and the
-- cascade removes it.
--
-- So it is read here, before any of that happens.
-- Dropped rather than replaced: the return type gains a column, and
-- `create or replace` refuses to change one.
drop function if exists public.purge_targets();
create function public.purge_targets()
returns table (
  user_id uuid,
  stripe_customer_id text,
  stripe_sub_id text,
  voice_note_paths text[],
  room_image_paths text[]
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_not_end_user('purge_targets');

  return query
  with due as (
    select d.user_id from public.deletion_requests d
    where d.status = 'requested' and d.purge_after <= now()
  )
  select
    due.user_id,
    s.stripe_customer_id,
    s.stripe_sub_id,
    coalesce(
      (select array_agg(m.voice_note_path)
         from public.messages m
        where m.sender_id = due.user_id
          and m.voice_note_path is not null
          and m.voice_note_path <> 'pending'),
      array[]::text[]
    ),
    coalesce(
      (select array_agg(r.image_path)
         from public.room_messages r
        where r.user_id = due.user_id
          and r.image_path is not null),
      array[]::text[]
    )
  from due
  left join public.subscriptions s on s.user_id = due.user_id;
end;
$$;

revoke all on function public.purge_targets() from public, anon, authenticated;
