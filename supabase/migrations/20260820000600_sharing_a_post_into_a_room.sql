-- Sharing a post into another room.
--
-- It becomes a post there rather than a pointer to one. A link a member has to
-- follow to find out what it is is not sharing, it is homework — and an article
-- shared into a room should read there exactly as it reads in Latest news.
--
-- ── WHAT DOES NOT TRAVEL ─────────────────────────────────────────────────────
-- The author. Not the name, not the alias, not the id. Republishing a name into
-- a room somebody did not choose to post in is doing to them the thing the
-- anonymity work exists to prevent, and an alias is per-room by design — it
-- means nothing outside the room it was minted in and could be lined up against
-- the one they have in the destination.
--
-- So a shared post is the SHARER'S post, carrying the words. That is also the
-- honest shape: they are the one who decided this belonged there, and they are
-- the one who can be replied to about it.
--
-- ── WHAT THE WALLS STILL SAY ─────────────────────────────────────────────────
-- The caller must be able to see the original and be a member of the
-- destination. Without the first, a guessed id copies a post out of a room the
-- caller was never in; without the second, a member posts into a room they do
-- not belong to — including, for a scoped room, one their community cannot see.
create or replace function public.share_post_to_room(p_message_id uuid, p_room_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := (select auth.uid());
  v_src record;
  v_new uuid;
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select m.body, m.article_url, m.article_title, m.article_source, m.article_icon, m.image_path
    into v_src
    from public.room_messages m
   where m.id = p_message_id
     and m.deleted_at is null
     and m.parent_id is null
     and public.i_am_in_room(m.room_id)
     and not public.i_am_blocked_with(m.user_id);

  if not found then
    raise exception 'no such post' using errcode = 'P0002';
  end if;

  if not public.i_am_in_room(p_room_id) then
    raise exception 'not in that room' using errcode = '42501';
  end if;

  -- An article shared twice into one room would be two copies of one headline,
  -- which the unique index refuses anyway; saying so is kinder than a
  -- constraint violation.
  if v_src.article_url is not null and exists (
    select 1 from public.room_messages m
     where m.room_id = p_room_id and m.article_url = v_src.article_url
  ) then
    raise exception 'already shared there' using errcode = 'P0001';
  end if;

  insert into public.room_messages
    (room_id, user_id, body, article_url, article_title, article_source, article_icon)
  values (
    p_room_id,
    -- An article keeps having no author, even shared: it is still nobody here's
    -- words. Anything else becomes the sharer's post.
    case when v_src.article_url is not null then null else v_me end,
    v_src.body,
    v_src.article_url,
    v_src.article_title,
    v_src.article_source,
    v_src.article_icon
  )
  returning id into v_new;

  return v_new;
end;
$$;

comment on function public.share_post_to_room(uuid, uuid) is
  'Copies a post into another room the caller belongs to. Carries the words and any article; never the original author.';

revoke all on function public.share_post_to_room(uuid, uuid) from public, anon;
grant execute on function public.share_post_to_room(uuid, uuid) to authenticated;

/* The rooms a member may share into: the ones they are in, minus this one. */
create or replace function public.rooms_i_can_share_into(p_except uuid default null)
returns table (id uuid, title text)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select r.id, r.title
    from public.rooms r
    join public.room_members m on m.room_id = r.id and m.user_id = (select auth.uid())
   where p_except is null or r.id <> p_except
   order by r.position, r.slug;
$$;

grant execute on function public.rooms_i_can_share_into(uuid) to authenticated;
