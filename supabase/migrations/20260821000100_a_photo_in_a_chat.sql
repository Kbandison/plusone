-- A photograph, in the one place two people actually talk.
--
-- The rooms have had this since 20260821 and a chat has not, which is backwards
-- from where it matters: a room post with a picture is a contribution, and a
-- picture sent to one person mid-conversation is most of what people mean by
-- talking. The column is new; everything around it is the shape voice notes
-- already established, because a chat photo has the same three properties —
-- private to two people, immutable once sent, and impossible to find again once
-- the row holding its path is gone.

alter table public.messages add column if not exists image_path text;

-- A picture with no words is a message.
--
-- messages_has_content has allowed exactly two kinds since Milestone 1, and an
-- image-only row would have been refused by a constraint written before there
-- were images.
alter table public.messages drop constraint if exists messages_has_content;
alter table public.messages add constraint messages_has_content check (
  (body is not null and char_length(body) between 1 and 4000)
  or voice_note_path is not null
  or image_path is not null
);

-- No column grants needed: 20260813000700 grants insert on the TABLE, so the
-- new column is already covered. Noted rather than left to be rediscovered —
-- the reverse case, a column-level grant that silently omits a new column, is
-- the failure this schema has hit six times.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-images',
  'chat-images',
  -- Private, like every other bucket here. A public URL to a photograph sent to
  -- one person is a permanent link anybody can hold.
  false,
  -- The same ceiling the app applies before it re-encodes (MAX_UPLOAD_BYTES).
  -- The stored object is a re-encoded webp and much smaller; this bounds what
  -- can be handed to the storage API at all.
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

-- Path convention: <chat_id>/<message_id>.webp — keyed on the CHAT rather than
-- the sender, because who may see it is decided by chat participation. The same
-- rule the messages policy uses, expressed in the path itself.

create policy "participants read chat images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-images'
    and public.i_am_in_chat(((storage.foldername(name))[1])::uuid)
  );

create policy "participants write chat images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-images'
    and public.i_am_in_chat(((storage.foldername(name))[1])::uuid)
    -- A closed chat accepts nothing further, pictures included.
    and public.chat_accepts_messages(((storage.foldername(name))[1])::uuid)
  );

-- The same narrow delete voice notes get, and for the same reason: the upload
-- happens before the insert, so a failed insert leaves an object nothing points
-- at. Removing a REFERENCED image would leave a message rendering a broken
-- picture forever, which §5.2's immutability is there to prevent.
create policy "participants may remove an unreferenced chat image"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-images'
    and public.i_am_in_chat(((storage.foldername(name))[1])::uuid)
    and not exists (
      select 1 from public.messages m where m.image_path = storage.objects.name
    )
  );

-- ── the two sweeps that have to take the pictures with them ───────────────────
--
-- Storage cannot cascade. Both of these already read voice-note paths out
-- BEFORE deleting the rows, because the row holding the path is the only index
-- there is — a chat image lives at chat-images/<chat_id>/<message_id> and there
-- is no user-id folder to list afterwards.
--
-- Adding a column to messages without adding it here is exactly how an
-- unreferenced, undiscoverable photograph of somebody who asked to be forgotten
-- survives their deletion.

drop function if exists public.sweep_purge_blocked_threads();
create function public.sweep_purge_blocked_threads()
returns table (chat_id uuid, voice_note_paths text[], image_paths text[])
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_days integer := public.config_int('retention.blocked_thread_days', 90);
  v_purged integer;
begin
  return query
  with due as (
    select ch.id
      from public.chats ch
      join public.connects c on c.id = ch.connect_id
     where ch.blocked_at is not null
       and ch.blocked_at < now() - make_interval(days => v_days)
       -- An open report holds the thread. A slow queue must not be able to
       -- destroy the evidence it has not read yet.
       and not exists (
         select 1
           from public.reports r
           join public.moderation_queue q on q.report_id = r.id
          where q.status = 'open'
            and (
              r.reported_user_id in (c.initiator_id, c.target_id)
              or r.reported_message_id in (select m.id from public.messages m where m.chat_id = ch.id)
            )
       )
       -- And a resolved one holds it for the same window past resolution, so
       -- the clock starts when somebody actually looked rather than when the
       -- report was filed.
       and not exists (
         select 1
           from public.reports r
           join public.moderation_queue q on q.report_id = r.id
          where q.resolved_at is not null
            and q.resolved_at > now() - make_interval(days => v_days)
            and (
              r.reported_user_id in (c.initiator_id, c.target_id)
              or r.reported_message_id in (select m.id from public.messages m where m.chat_id = ch.id)
            )
       )
  ),
  gone as (
    delete from public.messages m
     using due
     where m.chat_id = due.id
     returning m.chat_id as cid, m.voice_note_path as voice, m.image_path as image
  )
  select
    g.cid,
    array_remove(array_agg(g.voice), null),
    array_remove(array_agg(g.image), null)
    from gone g
   group by g.cid;

  get diagnostics v_purged = row_count;

  if v_purged > 0 then
    -- No ids, no bodies, no member. The count is the whole entry.
    perform public.audit('retention.blocked_messages_purged', 'chat', null,
      jsonb_build_object('threads', v_purged, 'after_days', v_days));
  end if;
end;
$$;

comment on function public.sweep_purge_blocked_threads() is
  'Deletes the messages of blocked-away threads past retention.blocked_thread_days, holding any thread an open or recently-resolved report touches, and returns the voice-note and chat-image paths for the caller to remove from storage.';

revoke all on function public.sweep_purge_blocked_threads() from public, anon, authenticated;

drop function if exists public.purge_targets();
create function public.purge_targets()
returns table (
  user_id uuid,
  stripe_customer_id text,
  stripe_sub_id text,
  voice_note_paths text[],
  room_image_paths text[],
  chat_image_paths text[]
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
    ),
    coalesce(
      (select array_agg(m.image_path)
         from public.messages m
        where m.sender_id = due.user_id
          and m.image_path is not null),
      array[]::text[]
    )
  from due
  left join public.subscriptions s on s.user_id = due.user_id;
end;
$$;

revoke all on function public.purge_targets() from public, anon, authenticated;
