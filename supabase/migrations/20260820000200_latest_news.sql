-- Latest news, scoped to the member's community.
--
-- Items arrive automatically from the allowlist in packages/config/src/news.ts
-- and publish on arrival (Kevin's call, 2026-08-20) — so the allowlist is the
-- only gate before a headline, and the admin screen is how one comes back off.
--
-- SCOPED WITH THE SAME ENUM THE ROOMS USE. A member in the hsv community sees
-- 'all' and 'hsv' and never 'hiv', which is the rule visible in the room bar
-- already; expressing it twice in two ways would be two rules to keep in step.
--
-- NO CLIENT WRITES AT ALL. Not even an admin one: everything that changes this
-- table goes through a definer function that checks is_admin() and audits, and
-- the ingest runs as the service role. A news feed is the product speaking, and
-- nothing a member does should be able to put words in its mouth.
create table public.news_items (
  id uuid primary key default extensions.gen_random_uuid(),
  /** Which allowlist entry brought it in, so a source can be traced or purged. */
  source_key text not null,
  source_name text not null,
  community_scope public.room_scope not null default 'all',
  title text not null,
  /** The article. Unique, because a feed repeats itself on every fetch. */
  url text not null unique,
  summary text,
  published_at timestamptz,
  created_at timestamptz not null default now(),

  constraint news_items_title_len check (char_length(title) between 1 and 300),
  constraint news_items_summary_len check (summary is null or char_length(summary) <= 1000),
  -- https only. The link becomes an href, and http would downgrade a member
  -- reading about their diagnosis onto a connection anybody on the network can
  -- watch.
  constraint news_items_url_https check (url like 'https://%')
);

alter table public.news_items enable row level security;

create index news_items_scope_ix on public.news_items (community_scope, published_at desc);

-- The same wall the rooms use, said the same way.
create policy "news in your community is readable" on public.news_items
  for select to authenticated
  using (
    community_scope = 'all'
    or community_scope::text = public.viewer_community()::text
  );

-- Supabase's default privileges grant every role everything on a NEW object in
-- this schema. check:db has caught this omission six times now.
revoke all on public.news_items from anon, authenticated;
grant select on public.news_items to authenticated;

/*
 * Editing one, from the admin screen.
 *
 * Scope is editable because an automated ingest guesses it from the source, and
 * a source that mostly serves one community will sometimes publish for
 * everybody.
 */
create or replace function public.admin_update_news_item(
  p_id uuid,
  p_title text,
  p_summary text,
  p_scope public.room_scope
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
    raise exception 'a news item needs a title' using errcode = '22023';
  end if;

  select title, summary, community_scope into v_old from public.news_items where id = p_id;
  if not found then
    raise exception 'no such news item' using errcode = 'P0002';
  end if;

  update public.news_items
     set title = btrim(p_title),
         summary = nullif(btrim(coalesce(p_summary, '')), ''),
         community_scope = p_scope
   where id = p_id;

  -- The old values go in the audit entry. A change nobody can read back is a
  -- change nobody can undo.
  perform public.audit('news.item_updated', 'news_item', p_id,
    jsonb_build_object('was', to_jsonb(v_old)));
end;
$$;

/*
 * Removing one.
 *
 * A real delete rather than a hidden flag: the ingest deduplicates on url, so a
 * hidden row would keep the article out forever and a deleted one lets a
 * corrected version back in. Removing something is not the same as banning it.
 */
create or replace function public.admin_delete_news_item(p_id uuid)
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

  select title, url, source_key into v_old from public.news_items where id = p_id;
  if not found then
    raise exception 'no such news item' using errcode = 'P0002';
  end if;

  delete from public.news_items where id = p_id;

  perform public.audit('news.item_deleted', 'news_item', p_id,
    jsonb_build_object('was', to_jsonb(v_old)));
end;
$$;

revoke all on function public.admin_update_news_item(uuid, text, text, public.room_scope)
  from public, anon;
revoke all on function public.admin_delete_news_item(uuid) from public, anon;
grant execute on function public.admin_update_news_item(uuid, text, text, public.room_scope)
  to authenticated;
grant execute on function public.admin_delete_news_item(uuid) to authenticated;
