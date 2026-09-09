-- The publisher's mark, and whose server fetches it.
--
-- ── the thing this closes ───────────────────────────────────────────────────
--
-- `article_icon` renders as an <img> in the news room, so the MEMBER'S BROWSER
-- fetches it — not the cron, not the agent. The host on the end of that url
-- learns an IP and a timestamp for somebody reading an HSV or HIV article. The
-- render already carries `referrerPolicy="no-referrer"` for exactly this reason,
-- which hides WHICH page but not that there was a request at all.
--
-- While the only writer was the cron that was five reviewed hosts in
-- NEWS_SOURCES. `ingest_article` opened a second door: an agent chooses the icon
-- now, and nothing stopped it choosing a tracker, an image host, or anything
-- else that would then be handed every member's address.
--
-- So the icon has to belong to the publisher whose article it labels. All ten
-- hosts in the room already satisfy this — it costs nothing today and refuses
-- the arbitrary third party that arrives later.
--
-- ── dropped, not refused ────────────────────────────────────────────────────
--
-- An off-domain icon loses the ICON and keeps the ARTICLE. The article is the
-- value and the mark is decoration, which is the same call the ingest route
-- makes about an unparseable publication date. A CDN under the publisher's own
-- domain still works; one under somebody else's does not, and that is the case
-- worth losing a logo over.
--
-- ── what this does NOT cover, since a guard is only useful if you can say ───
--
-- "Same domain" is the last two labels, so a publisher on a multi-part suffix
-- like `example.co.uk` compares as `co.uk` and would accept an icon from any
-- other `.co.uk` host. Postgres has no public suffix list. Every source here is
-- .com / .org / .gov / .int, so the gap is real and currently unreachable —
-- whoever adds a `.co.uk` publisher should come back to this.
--
-- Malformed authorities fail CLOSED. `https://aidsmap.com@evil.com/x` parses to
-- `com@evil.com`, which matches nothing and drops the icon.

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
  v_icon text := nullif(btrim(coalesce(p_icon, '')), '');
  v_article_domain text;
  v_icon_domain text;
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

  -- http would be mixed content and blocked by the browser anyway; dropping it
  -- here means the neutral frame renders instead of a hole.
  if v_icon is not null and v_icon !~ '^https://' then
    v_icon := null;
  end if;

  if v_icon is not null then
    -- Authority, port removed, then the last two labels. See the suffix note
    -- above for what this deliberately does not handle.
    v_article_domain := (regexp_match(
      lower(split_part(split_part(split_part(v_url, '//', 2), '/', 1), ':', 1)),
      '([^.]+\.[^.]+)$'))[1];
    v_icon_domain := (regexp_match(
      lower(split_part(split_part(split_part(v_icon, '//', 2), '/', 1), ':', 1)),
      '([^.]+\.[^.]+)$'))[1];

    if v_article_domain is null
       or v_icon_domain is null
       or v_article_domain <> v_icon_domain then
      v_icon := null;
    end if;
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
      (v_room, null, v_body, v_url, v_title, v_source, v_icon,
       coalesce(p_published_at, now()))
    -- Carries the partial index predicate. 20260909000300 has why.
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
  'Shared validation and insert for a Latest news article. ON CONFLICT carries the partial index predicate. An icon not on the article''s own domain is dropped, because the member''s browser is what fetches it. Authorisation belongs to the caller.';
