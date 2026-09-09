-- A machine path into Latest news, and one wall for both callers.
--
-- Kevin is pointing Claude Cowork at this: an agent that can read the
-- publishers the ingest cannot — POZ, aidsmap, Positively Aware, Westover
-- Heights, all of which refuse a non-browser agent — and post what it finds.
--
-- ── the validation moves DOWN, it is not copied ─────────────────────────────
--
-- 20260909000100 put the rules in `admin_post_article`: https only, a headline,
-- a source, and Latest news rooms only. A second caller must not mean a second
-- copy of those rules, because the copy is what drifts — and the thing drifting
-- here would be "which rooms may receive an authorless post".
--
-- So `ingest_article` holds them and `admin_post_article` becomes a thin
-- authorisation wrapper around it. Replacing an applied function through a NEW
-- file is the supported move; editing 20260909000100 is not.

create or replace function public.ingest_article(
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
  -- NO is_admin() HERE, deliberately. This function does not decide who may
  -- call it; its callers do. `admin_post_article` checks a person is an admin,
  -- and the route checks a shared secret. Putting an identity check in here
  -- would make the machine path impossible without weakening it for both.
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
      (room_id, user_id, body, article_url, article_title, article_source, article_icon)
    values
      (v_room, null, v_body, v_url, v_title, v_source, nullif(btrim(coalesce(p_icon, '')), ''))
    on conflict (room_id, article_url) do nothing;

    v_added := v_added + case when found then 1 else 0 end;
  end loop;

  return v_added;
end;
$$;

-- Not reachable by a member, in either role. `authenticated` goes nowhere near
-- this: a member calling it directly would be posting an authorless article
-- into a room, which is the whole thing the wrapper's is_admin() decides.
revoke all on function public.ingest_article(uuid[], text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.ingest_article(uuid[], text, text, text, text, text)
  to service_role;

comment on function public.ingest_article(uuid[], text, text, text, text, text) is
  'Shared validation and insert for a Latest news article. Authorisation belongs to the caller: admin_post_article checks is_admin, the ingest route checks a shared secret.';

/**
 * The admin form's entry point, now a wrapper.
 *
 * Identical behaviour to 20260909000100 — same checks, same messages, same
 * return — because they all still run, one function down. What changed is that
 * there is now exactly one place that decides what a Latest news article may be.
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

  return public.ingest_article(p_room_ids, p_url, p_title, p_source, p_summary, p_icon);
end;
$$;

revoke all on function public.admin_post_article(uuid[], text, text, text, text, text)
  from public, anon;
grant execute on function public.admin_post_article(uuid[], text, text, text, text, text)
  to authenticated;
