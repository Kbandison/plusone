-- The news admin follows the articles into room_messages.
--
-- news_items was the right shape for a table of links and the wrong shape for
-- posts, which is what articles became in 20260820000300. Two records of one
-- article is one too many, and the one that can be liked and replied to is the
-- one that survives.
--
-- Editing and deleting move with it. Both still refuse a non-admin and both
-- still audit the previous value, because a change nobody can read back is a
-- change nobody can undo.

drop function if exists public.admin_update_news_item(uuid, text, text, public.room_scope);
drop function if exists public.admin_delete_news_item(uuid);
drop table if exists public.news_items;

/*
 * Editing an article post.
 *
 * The headline and the summary, and nothing else: the URL is the identity of
 * the thing and the source is a claim about who published it. An admin who
 * needs a different article deletes this one and lets the ingest bring the
 * right one in.
 */
create or replace function public.admin_update_article(
  p_id uuid,
  p_title text,
  p_summary text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old record;
begin
  if not public.is_admin() then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'an article needs a headline' using errcode = '22023';
  end if;

  select article_title, body into v_old
    from public.room_messages
   where id = p_id and article_url is not null;
  if not found then
    raise exception 'no such article' using errcode = 'P0002';
  end if;

  update public.room_messages
     set article_title = btrim(p_title),
         -- The summary is the post's body: an article reads like a post rather
         -- than like a link with a heading over it.
         body = coalesce(nullif(btrim(coalesce(p_summary, '')), ''), btrim(p_title))
   where id = p_id;

  perform public.audit('news.article_updated', 'room_message', p_id,
    jsonb_build_object('was', to_jsonb(v_old)));
end;
$$;

/*
 * Removing one.
 *
 * A real delete rather than deleted_at: the ingest deduplicates on
 * (room_id, article_url), so a soft-deleted row would keep the article out
 * forever and a removed one lets a corrected version back in. Removing
 * something is not the same as banning it.
 *
 * Its comments go with it, which is what the cascade on parent_id already does
 * — and is right: a thread about an article that is no longer there is a
 * conversation with nothing at the top of it.
 */
create or replace function public.admin_delete_article(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old record;
begin
  if not public.is_admin() then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  select article_title, article_url, article_source into v_old
    from public.room_messages
   where id = p_id and article_url is not null;
  if not found then
    raise exception 'no such article' using errcode = 'P0002';
  end if;

  delete from public.room_messages where id = p_id;

  perform public.audit('news.article_deleted', 'room_message', p_id,
    jsonb_build_object('was', to_jsonb(v_old)));
end;
$$;

revoke all on function public.admin_update_article(uuid, text, text) from public, anon;
revoke all on function public.admin_delete_article(uuid) from public, anon;
grant execute on function public.admin_update_article(uuid, text, text) to authenticated;
grant execute on function public.admin_delete_article(uuid) to authenticated;

/*
 * What the admin screen lists.
 *
 * A definer function rather than a select, because room_messages does not grant
 * user_id to a client and the screen wants the room a thing landed in — and
 * because an admin listing articles should not depend on being a member of the
 * rooms they were posted to.
 */
create or replace function public.admin_articles(p_limit integer default 200)
returns table (
  id uuid,
  room_title text,
  community_scope public.room_scope,
  article_title text,
  article_url text,
  article_source text,
  summary text,
  created_at timestamptz,
  comment_count integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    m.id,
    r.title,
    r.community_scope,
    m.article_title,
    m.article_url,
    m.article_source,
    m.body,
    m.created_at,
    (select count(*) from public.room_messages c
      where c.parent_id = m.id and c.deleted_at is null)::integer
  from public.room_messages m
  join public.rooms r on r.id = m.room_id
  where m.article_url is not null
    and m.deleted_at is null
    and public.is_admin()
  order by m.created_at desc
  limit greatest(least(p_limit, 500), 1);
$$;

revoke all on function public.admin_articles(integer) from public, anon;
grant execute on function public.admin_articles(integer) to authenticated;

-- ── what the room says about itself ──────────────────────────────────────────
--
-- Said once at the top, because everything below it was written by somebody
-- else and a member should know that before they read it as ours. On the room
-- rather than in the page, because the page is the ordinary room page now and
-- has nothing that knows this one is different.
--
-- CLAUDE'S WORDS, like the rest of the room copy.
update public.rooms
   set description = 'Published elsewhere, gathered here. Opening an article leaves Plus One.'
 where slug like 'latest-news-%';
