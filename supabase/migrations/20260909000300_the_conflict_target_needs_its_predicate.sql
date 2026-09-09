-- Every article insert has been failing since 2026-08-20.
--
-- ── the error, and what it actually means ───────────────────────────────────
--
--   there is no unique or exclusion constraint matching the ON CONFLICT
--   specification
--
-- Reported by Claude Cowork against /api/news/ingest, and reproduced here
-- against the live database inside a rolled-back transaction:
--
--   on conflict (room_id, article_url) do nothing                    -> ERROR
--   on conflict (room_id, article_url)
--     where article_url is not null do nothing                       -> OK
--
-- `room_messages_article_once_per_room` is a PARTIAL unique index — 20260820000300
-- built it `where article_url is not null`, correctly, because most room posts
-- have no article and a plain unique index would make them collide on NULL.
-- Postgres will only use a partial index for ON CONFLICT if the statement
-- repeats the index predicate, so the planner can prove the index covers every
-- row the statement could touch. Without it there is no matching arbiter and the
-- whole INSERT fails.
--
-- ── it is not just the new endpoint ─────────────────────────────────────────
--
-- The CRON has the same defect by a different route: PostgREST's upsert emits
-- exactly `ON CONFLICT (room_id, article_url) DO NOTHING` and cannot express a
-- predicate at all. The evidence lines up — the newest article in the rooms is
-- dated 2026-08-20, the same day the partial index was created, and ASHA has
-- published articles since that are absent. Latest news has been frozen for
-- three weeks and the job kept reporting the failure into a `failures` array
-- nobody reads.
--
-- That reframes the source audit of 2026-09-09: four of five feeds WERE dead,
-- and that was still not why the room stopped. ASHA was alive the whole time.
--
-- So the cron moves onto this function too — one insert, one conflict clause,
-- three callers. PostgREST cannot say `where article_url is not null`; a
-- function can.

create or replace function public.ingest_article(
  p_room_ids uuid[],
  p_url text,
  p_title text,
  p_source text,
  p_summary text default null,
  p_icon text default null,
  p_published_at timestamptz default null
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
  if v_title = '' then
    raise exception 'an article needs a headline' using errcode = '22023';
  end if;
  if v_source = '' then
    raise exception 'an article needs a source' using errcode = '22023';
  end if;
  if v_url !~ '^https://' then
    raise exception 'an article link must be https' using errcode = '22023';
  end if;

  if v_body = '' then
    v_body := v_title;
  end if;

  foreach v_room in array coalesce(p_room_ids, '{}')
  loop
    if not exists (
      select 1 from public.rooms
       where id = v_room and slug like 'latest-news-%'
    ) then
      raise exception 'not a Latest news room' using errcode = '22023';
    end if;

    insert into public.room_messages
      (room_id, user_id, body, article_url, article_title, article_source, article_icon, created_at)
    values
      (v_room, null, v_body, v_url, v_title, v_source,
       nullif(btrim(coalesce(p_icon, '')), ''),
       coalesce(p_published_at, now()))
    -- THE PREDICATE IS THE FIX. Without it Postgres cannot match the partial
    -- index and refuses the whole statement — which is what has been happening
    -- to every article since the index was created.
    on conflict (room_id, article_url) where article_url is not null do nothing;

    v_added := v_added + case when found then 1 else 0 end;
  end loop;

  return v_added;
end;
$$;

revoke all on function public.ingest_article(uuid[], text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.ingest_article(uuid[], text, text, text, text, text, timestamptz)
  to service_role;

comment on function public.ingest_article(uuid[], text, text, text, text, text, timestamptz) is
  'Shared validation and insert for a Latest news article. ON CONFLICT carries the partial index predicate — without it every insert fails. Authorisation belongs to the caller.';

-- The six-argument version goes, so nothing can call the broken one by accident.
-- Its only caller is admin_post_article, replaced below in the same file.
drop function if exists public.ingest_article(uuid[], text, text, text, text, text);

/**
 * The admin form's entry point. Unchanged behaviour, one argument wider.
 *
 * A hand-posted article has no publication date to carry, so it keeps `now()` —
 * which is what the old insert did implicitly.
 */
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
begin
  if not public.is_admin() then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  return public.ingest_article(p_room_ids, p_url, p_title, p_source, p_summary, p_icon, null);
end;
$$;

revoke all on function public.admin_post_article(uuid[], text, text, text, text, text)
  from public, anon;
grant execute on function public.admin_post_article(uuid[], text, text, text, text, text)
  to authenticated;
