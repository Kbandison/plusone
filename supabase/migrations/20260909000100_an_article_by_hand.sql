-- Posting an article by hand.
--
-- ── why a person has to be able to do this ──────────────────────────────────
--
-- Measured 2026-09-09, across every live feed found: NINE articles currently on
-- offer are about herpes and a hundred and twelve are about HIV. That is not a
-- pipeline fault and no source list fixes it — TheBody and TheBodyPro publish
-- constantly for people with HIV and nothing comparable publishes for people
-- with HSV.
--
-- The other half is reachability. POZ, aidsmap, Positively Aware, Westover
-- Heights and Medical News Today all refuse a non-browser agent or 404 on every
-- documented path; a person opens them fine. The ingest cannot have those
-- articles and a person can.
--
-- So this writes the SAME SHAPE the cron writes — `article_url` is what makes a
-- room_message an article, and every surface already renders one. It is not a
-- second kind of post.

create or replace function public.admin_post_article(
  p_room_ids uuid[],
  p_url text,
  p_title text,
  p_source text,
  p_summary text default null,
  p_icon text default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_added integer := 0;
  v_room uuid;
  v_url text := btrim(coalesce(p_url, ''));
  v_title text := btrim(coalesce(p_title, ''));
  v_source text := btrim(coalesce(p_source, ''));
  v_body text := btrim(coalesce(p_summary, ''));
begin
  if not public.is_admin() then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  if v_title = '' then
    raise exception 'an article needs a headline' using errcode = '22023';
  end if;
  if v_source = '' then
    raise exception 'an article needs a source' using errcode = '22023';
  end if;

  -- https only, and checked HERE rather than in the form.
  --
  -- The form is one caller; this function is the wall. An http link in a room
  -- is a downgrade a member cannot see coming, and `article_url` is rendered as
  -- a link on six surfaces.
  if v_url !~ '^https://' then
    raise exception 'an article link must be https' using errcode = '22023';
  end if;

  -- The body is what the card shows, and messages_has_content requires one.
  -- Falling back to the headline matches what the cron does with an item that
  -- has no summary.
  if v_body = '' then
    v_body := v_title;
  end if;

  foreach v_room in array coalesce(p_room_ids, '{}')
  loop
    -- Latest news rooms only. Without this an admin could put an article into
    -- any room by id, and a hand-posted article carries no author — a post with
    -- no author in a discussion room reads as a member who deleted themselves.
    if not exists (
      select 1 from public.rooms
       where id = v_room and slug like 'latest-news-%'
    ) then
      raise exception 'not a Latest news room' using errcode = '22023';
    end if;

    -- Same conflict target as the ingest, so posting one the cron already has
    -- is a no-op rather than a duplicate. This is the ordinary case: an admin
    -- posts something, the feed catches up later and finds it present.
    insert into public.room_messages
      (room_id, user_id, body, article_url, article_title, article_source, article_icon)
    values
      (v_room, null, v_body, v_url, v_title, v_source, nullif(btrim(coalesce(p_icon, '')), ''))
    on conflict (room_id, article_url) do nothing;

    v_added := v_added + case when found then 1 else 0 end;
  end loop;

  return v_added;
end;
$$;

revoke all on function public.admin_post_article(uuid[], text, text, text, text, text)
  from public, anon;
grant execute on function public.admin_post_article(uuid[], text, text, text, text, text)
  to authenticated;

comment on function public.admin_post_article(uuid[], text, text, text, text, text) is
  'Admin: post an article into Latest news by hand. Same shape as the ingest, deduplicated on (room_id, article_url).';

/**
 * The rooms an article can be posted into.
 *
 * A definer function rather than a select, for the same reason `admin_articles`
 * is one: `rooms` is readable only where `community_scope` matches the viewer's
 * own community, so an admin who has HSV cannot see the HIV news room at all.
 * The form has to offer both.
 *
 * Returns nothing to a non-admin rather than raising — this is a list, and an
 * empty one is the correct answer for somebody who may not have it.
 */
create or replace function public.admin_news_rooms()
returns table (id uuid, slug text, title text, community_scope text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.slug, r.title, r.community_scope::text
    from public.rooms r
   where public.is_admin()
     and r.slug like 'latest-news-%'
   order by r.community_scope;
$$;

revoke all on function public.admin_news_rooms() from public, anon;
grant execute on function public.admin_news_rooms() to authenticated;
