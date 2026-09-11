-- A hand-posted article keeps the date it was published.
--
-- `ingest_article` has taken `p_published_at` since 20260909000300, and the
-- cron and the agent endpoint both pass one. `admin_post_article` passes NULL,
-- so anything posted through /admin/news is stamped `now()` — the moment
-- somebody pressed the button.
--
-- That was defensible while the admin form existed only for the occasional
-- piece the ingest could not reach. It stops being defensible the moment it is
-- the fallback for a whole run: Claude Cowork's scheduled ingest was blocked by
-- its own sandbox on 2026-09-11 and six articles had to go in by hand, all of
-- them published days earlier.
--
-- The room sorts on `created_at`, so a backfilled article stamped with the
-- moment of posting sorts above genuinely newer ones and reads as today's news.
-- On a room whose whole job is "what has been published", that is not cosmetic.
--
-- ── null still means now, deliberately ────────────────────────────────────
--
-- The date is optional. Some pieces genuinely have no publication date worth
-- quoting, and a required field would make somebody invent one. Absent, the
-- behaviour is exactly what it was.

create or replace function public.admin_post_article(
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
begin
  if not public.is_admin() then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  -- A date in the future is refused rather than clamped. Clamping would silently
  -- turn a typo into "posted now", which is the exact behaviour this migration
  -- exists to stop, and the member would never see that it happened.
  if p_published_at is not null and p_published_at > now() + interval '1 day' then
    raise exception 'an article cannot be published in the future' using errcode = '22023';
  end if;

  return public.ingest_article(
    p_room_ids, p_url, p_title, p_source, p_summary, p_icon, p_published_at);
end;
$$;

-- The six-argument version goes, so nothing can call the one that discards the
-- date by accident. Its only caller is the admin form, updated in the same
-- commit.
drop function if exists public.admin_post_article(uuid[], text, text, text, text, text);

revoke all on function public.admin_post_article(uuid[], text, text, text, text, text, timestamptz)
  from public, anon;
grant execute on function public.admin_post_article(uuid[], text, text, text, text, text, timestamptz)
  to authenticated;

comment on function public.admin_post_article(uuid[], text, text, text, text, text, timestamptz) is
  'Admin: post an article into Latest news by hand, keeping its own publication date. Null means now. A date more than a day ahead is refused rather than clamped.';
