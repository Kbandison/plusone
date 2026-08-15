-- The config editor and the metrics dashboard (§7.3).
--
-- §7.3 says the config table is "hot-read by logic". Half of that was true: the
-- SQL functions read it through config_int(), and the TypeScript in
-- packages/logic used its compiled-in defaults. An administrator changing the
-- Drop weights would have changed nothing, and nothing would have said so.
--
-- `tunable_config()` closes it. The values are not secret — most of them are
-- published in the FAQ — so members read it too, which is what lets the Drop
-- pick them up without a service client in a request path.

create or replace function public.tunable_config()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.app_config;
$$;

comment on function public.tunable_config() is
  'Every tunable as one object, so packages/logic can hot-read what §7.3 promises it hot-reads.';

grant execute on function public.tunable_config() to authenticated;

-- ── editing ───────────────────────────────────────────────────────────────────
-- A write path with a whitelist. `app_config` has an admin-only policy already,
-- but a policy says who may write, not what is writable — and an administrator
-- who can invent keys can invent one that nothing reads, which looks like a
-- setting that does nothing.
create or replace function public.admin_set_config(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old jsonb;
begin
  if not public.is_admin() then
    raise exception 'not an administrator' using errcode = '42501';
  end if;

  -- Only keys that already exist. The seed defines the full set, so this
  -- refuses both typos and inventions.
  select value into v_old from public.app_config where key = p_key;
  if v_old is null then
    raise exception 'unknown config key: %', p_key using errcode = 'P0002';
  end if;

  if jsonb_typeof(p_value) not in ('number', 'object') then
    raise exception 'config values are numbers or objects' using errcode = '22023';
  end if;

  update public.app_config
  set value = p_value, updated_by = (select auth.uid()), updated_at = now()
  where key = p_key;

  -- The old value is in the audit entry. A config change that cannot be read
  -- backwards is a change nobody can undo at 3am.
  perform public.audit(
    'config.set', 'app_config', null,
    jsonb_build_object('key', p_key, 'from', v_old, 'to', p_value)
  );
end;
$$;

grant execute on function public.admin_set_config(text, jsonb) to authenticated;

-- ── metrics (§7.3) ────────────────────────────────────────────────────────────
-- Counts only. No member appears in this, by name or by id: a dashboard is the
-- easiest place for a product to start looking at individuals because it is the
-- one screen where doing so feels like analysis.
create or replace function public.admin_metrics()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when not public.is_admin() then '{}'::jsonb else jsonb_build_object(
    'verified_members', (select count(*) from public.profiles where verification_status = 'verified'),
    'onboarded_members', (select count(*) from public.profiles where onboarded_at is not null),
    'support_only_members', (select count(*) from public.profiles where mode = 'support_only'),
    'active_this_week', (
      select count(*) from public.profiles where last_active_at > now() - interval '7 days'
    ),
    'drops_served', (select count(*) from public.drops),
    'connects_sent', (select count(*) from public.connects),
    'connects_accepted', (select count(*) from public.connects where status = 'accepted'),
    'chats_open', (select count(*) from public.chats where status = 'open'),
    'chats_date_planned', (select count(*) from public.chats where status = 'date_planned'),
    'chats_graduated', (select count(*) from public.chats where status = 'graduated'),
    'chats_closed_by_fuse', (select count(*) from public.chats where status = 'closed_fuse'),
    'chats_closed_by_member', (select count(*) from public.chats where status = 'closed_by_member'),
    -- §7.3 asks for the "closure vs ghost-equivalent rate", and the answer is
    -- structurally zero: chats_fuse_matches_status and the sweep together mean
    -- a closed chat always carries a note. This counts the ones that do not, so
    -- the claim is measured rather than asserted. If it is ever non-zero, the
    -- product's central promise has broken and this is where it shows.
    'closed_without_a_note', (
      select count(*) from public.chats
      where status in ('closed_fuse', 'closed_by_member') and closure_template is null
    ),
    'open_reports', (select count(*) from public.moderation_queue where status = 'open'),
    'subscriptions_active', (
      select count(*) from public.subscriptions
      where status in ('active', 'trialing')
        and (current_period_end is null or current_period_end > now())
    ),
    'premium_from_grants', (
      select count(distinct user_id) from public.premium_grants where expires_at > now()
    ),
    'referral_conversions', (
      select count(*) from public.referral_conversions where verified_at is not null
    )
  ) end;
$$;

grant execute on function public.admin_metrics() to authenticated;
