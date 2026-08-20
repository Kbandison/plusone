-- Images on a room post.
--
-- §4.2 lists room-media as a v2 bucket. This is it, brought forward, and the
-- decisions that come with it are worth writing down rather than discovering:
--
-- 1. THE PATH NAMES THE ROOM, NEVER THE AUTHOR.
--    <room_id>/<message_id>.webp. A path with a user id in it hands the author
--    of an anonymous post to anyone who sees the URL — the whole projection in
--    room_feed exists to stop exactly that, and a storage key would have walked
--    around it. This is the same reasoning voice notes use for keying on the
--    chat.
--
-- 2. THE IMAGE IS RE-ENCODED SERVER-SIDE BEFORE IT IS STORED.
--    A photograph carries GPS coordinates, a device serial, and the moment it
--    was taken. In a room named for a diagnosis, an anonymous post with the
--    poster's home coordinates inside it is worse than no anonymity at all,
--    because it looks like anonymity. lib/photos already does this for profile
--    photos: sharp rotate() applies the EXIF orientation and then the re-encode
--    drops every tag, since sharp keeps metadata only when asked to.
--
-- 3. PRIVATE, READ THROUGH A SIGNED URL, MEMBERSHIP-SCOPED.
--    A public URL to a picture posted in "Newly diagnosed" is a permanent
--    public URL to a picture posted in "Newly diagnosed".
--
-- WHAT THIS DOES NOT SOLVE, and Kevin should know it: §11's moderation is
-- rule-based on TEXT — a blocklist and patterns. None of that reads an image.
-- An image is reportable and a moderator can delete it, but the first line of
-- defence for a picture is somebody seeing it, which is a slower loop than the
-- one text gets.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'room-images',
  'room-images',
  false,
  -- The stored object is a re-encoded webp bounded by MAX_EDGE, which lands
  -- well under this. The ceiling is for what arrives, not for what is kept.
  5242880,
  array['image/webp']
)
on conflict (id) do nothing;

-- Path convention: <room_id>/<message_id>.webp. Keyed on the ROOM, because who
-- may see it is decided by room membership — the same rule room_messages uses,
-- expressed in the path itself, and containing nothing about who posted it.
create policy "members read room images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'room-images'
    and public.i_am_in_room(((storage.foldername(name))[1])::uuid)
  );

create policy "members write room images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'room-images'
    and public.i_am_in_room(((storage.foldername(name))[1])::uuid)
  );

-- No delete policy. A post is not editable, and letting the image be removed
-- while the row remains would leave a post pointing at nothing. Moderation
-- deletes through the admin path, and the hard-delete sweep through the service
-- role.

alter table public.room_messages
  add column if not exists image_path text;

comment on column public.room_messages.image_path is
  'room-images/<room_id>/<message_id>.webp. Never contains the author id: an anonymous post''s image must not name who posted it.';

-- The client may write it, and may read it. It says nothing about anybody.
grant insert (room_id, user_id, body, anonymous, parent_id, image_path)
  on public.room_messages to authenticated;
grant select (id, room_id, body, deleted_at, created_at, anonymous, author_alias, parent_id, image_path)
  on public.room_messages to authenticated;

-- A post with a picture and no words is a post. The body constraint has always
-- required at least one character, so this is what makes an image-only post
-- possible at all.
alter table public.room_messages drop constraint if exists room_messages_body_len;
alter table public.room_messages
  add constraint room_messages_body_len
  check (char_length(body) <= 2000);

alter table public.room_messages
  add constraint room_messages_has_content
  check (char_length(btrim(body)) > 0 or image_path is not null);

-- ── the projections carry it ─────────────────────────────────────────────────
--
-- Dropped rather than replaced: the return type gains a column, and
-- `create or replace` refuses to change one.
drop function if exists public.room_thread(uuid);
drop function if exists public.room_feed(uuid, integer);

create function public.room_thread(p_message_id uuid)
returns table (
  id uuid,
  parent_id uuid,
  body text,
  image_path text,
  created_at timestamptz,
  anonymous boolean,
  author_id uuid,
  author_name text,
  is_mine boolean,
  like_count integer,
  i_liked boolean,
  comment_count integer,
  view_count integer,
  is_root boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with visible as (
    select m.*
      from public.room_messages m
     where m.deleted_at is null
       and public.i_am_in_room(m.room_id)
       and not public.i_am_blocked_with(m.user_id)
  )
  select
    m.id,
    m.parent_id,
    m.body,
    m.image_path,
    m.created_at,
    m.anonymous,
    case when m.anonymous then null else m.user_id end,
    case when m.anonymous then m.author_alias else p.display_name end,
    m.user_id = (select auth.uid()),
    (select count(*) from public.room_likes l where l.message_id = m.id)::integer,
    exists (
      select 1 from public.room_likes l
       where l.message_id = m.id and l.user_id = (select auth.uid())
    ),
    (select count(*) from visible c where c.parent_id = m.id)::integer,
    case
      when m.user_id = (select auth.uid())
      then (select count(*) from public.room_post_views v where v.message_id = m.id)::integer
    end,
    m.id = p_message_id
  from visible m
  left join public.profiles p on p.id = m.user_id
  where m.id = p_message_id
     or m.parent_id = p_message_id
     or m.parent_id in (select c.id from visible c where c.parent_id = p_message_id)
  order by
    (m.id = p_message_id) desc,
    case when m.parent_id = p_message_id then 0 else 1 end,
    case when m.parent_id = p_message_id then m.created_at end desc,
    m.created_at asc;
$$;

comment on function public.room_thread(uuid) is
  'A post, its comments newest first, and their replies oldest first, in the projection room_feed uses. comment_count is direct children.';

revoke all on function public.room_thread(uuid) from public, anon;
grant execute on function public.room_thread(uuid) to authenticated;

create function public.room_feed(p_room_id uuid, p_limit integer default 100)
returns table (
  id uuid,
  body text,
  image_path text,
  created_at timestamptz,
  anonymous boolean,
  author_id uuid,
  author_name text,
  is_mine boolean,
  like_count integer,
  i_liked boolean,
  comment_count integer,
  view_count integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with visible as (
    select m.id, m.parent_id, m.user_id
      from public.room_messages m
     where m.deleted_at is null
       and not public.i_am_blocked_with(m.user_id)
  )
  select
    m.id,
    m.body,
    m.image_path,
    m.created_at,
    m.anonymous,
    case when m.anonymous then null else m.user_id end,
    case when m.anonymous then m.author_alias else p.display_name end,
    m.user_id = (select auth.uid()),
    (select count(*) from public.room_likes l where l.message_id = m.id)::integer,
    exists (
      select 1 from public.room_likes l
       where l.message_id = m.id and l.user_id = (select auth.uid())
    ),
    (
      select count(*) from visible c
       where c.parent_id = m.id
          or c.parent_id in (select d.id from visible d where d.parent_id = m.id)
    )::integer,
    case
      when m.user_id = (select auth.uid())
      then (select count(*) from public.room_post_views v where v.message_id = m.id)::integer
    end
  from public.room_messages m
  left join public.profiles p on p.id = m.user_id
  where m.room_id = p_room_id
    and m.parent_id is null
    and m.deleted_at is null
    and public.i_am_in_room(m.room_id)
    and not public.i_am_blocked_with(m.user_id)
  order by m.created_at desc
  limit greatest(least(p_limit, 200), 1);
$$;

comment on function public.room_feed(uuid, integer) is
  'A room''s top-level posts as they may be shown. comment_count is every descendant, which is what "how many comments" means on a feed row.';

revoke all on function public.room_feed(uuid, integer) from public, anon;
grant execute on function public.room_feed(uuid, integer) to authenticated;
