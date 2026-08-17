-- Seven holes a second audit found in the fixes from earlier today. All mine.

-- ── 1. record_drop let a member write their OWN Drop ──────────────────────────
-- The worst of them. record_drop is SECURITY DEFINER and granted to every
-- member, and it validated the DATE while taking the id array straight from the
-- caller — no check that those profiles were ranked, visible, or real.
--
-- enforce_connect_rules grants Decision #15's zero-cost connect on exactly
-- "is this target in my drops row", so a member could post an array containing
-- everyone they wanted and manufacture unlimited free connects. I built the
-- wall in 20260815001100 and then handed out a key.
--
-- Two bounds now, both server-side: the array cannot be longer than the Drop
-- itself, and every id in it must be one this member can actually see. Visible
-- is not the same as ranked — the ranking lives in packages/logic and cannot be
-- re-run here — but it is the same wall every other connect path already tests,
-- so a forged Drop buys nothing a plain connect would not.
create or replace function public.record_drop(
  p_drop_date date,
  p_served_profile_ids uuid[],
  p_radius_used_mi integer,
  p_is_preview boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_max integer := public.config_int('drop.count', 3);
  v_today date := (now() at time zone 'utc')::date;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- A day either side of UTC today.
  --
  -- The Drop is keyed on the member's LOCAL date, and the guard compared it to
  -- the UTC one — so every member east of UTC, opening the app between local
  -- midnight and UTC midnight, sent a date this refused. A Sydney member at
  -- 02:00 local got a Drop that was assembled, shown, and never recorded.
  if p_drop_date > v_today + 1 or p_drop_date < v_today - 1 then
    raise exception 'a drop is for today' using errcode = '22023';
  end if;

  if coalesce(array_length(p_served_profile_ids, 1), 0) > v_max then
    raise exception 'a drop is at most % cards', v_max using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_served_profile_ids, array[]::uuid[])) as t(id)
    where not exists (select 1 from public.visible_profiles v where v.id = t.id)
  ) then
    raise exception 'a drop card must be someone you can see' using errcode = '42501';
  end if;

  insert into public.drops (user_id, drop_date, served_profile_ids, radius_used_mi, is_preview)
  values (v_uid, p_drop_date, p_served_profile_ids, p_radius_used_mi, p_is_preview)
  on conflict (user_id, drop_date) do nothing;
end;
$$;

revoke all on function public.record_drop(date, uuid[], integer, boolean) from public, anon;
grant execute on function public.record_drop(date, uuid[], integer, boolean) to authenticated;

-- ── 2. the block trigger missed the state where blocking matters most ─────────
-- close_chats_on_block filtered `status = 'open'`, but the wall it delegates to
-- — chat_accepts_messages — returns true for 'open' AND 'date_planned'. So a
-- block placed after a date was agreed did nothing at all: the original bug,
-- verbatim, in the one case where somebody most needs the button to work.
--
-- The plan is cleared too. A closed chat should not still display a meeting
-- time that is no longer happening.
create or replace function public.close_chats_on_block()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.chats c
     set status = 'closed_by_member',
         closed_reason = 'blocked',
         closed_at = now(),
         fuse_expires_at = null,
         date_plan = null
    from public.connects k
   where c.connect_id = k.id
     and c.status in ('open', 'date_planned')
     and (
       (k.initiator_id = new.blocker_id and k.target_id = new.blocked_id)
       or (k.initiator_id = new.blocked_id and k.target_id = new.blocker_id)
     );

  return new;
end;
$$;

-- ── 3. a re-armed fuse never warned again ────────────────────────────────────
-- fuse_warned_at is a one-shot stamp, but fuse_expires_at is not: cancelling a
-- date plan re-arms it for another 72 hours and puts the chat back to 'open'.
-- Nothing cleared the stamp, so claim_fuse_warnings excluded that chat for the
-- rest of its life — a brand-new countdown nobody would be warned about.
create or replace function public.cancel_date_plan(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := (select auth.uid());
  v_chat public.chats%rowtype;
  v_rearm integer := public.config_int('fuse.rearm_hours_after_cancelled_plan', 72);
begin
  select * into v_chat from public.chats where id = p_chat_id for update;

  if not public.is_chat_participant(p_chat_id, v_caller) then
    raise exception 'not a participant' using errcode = '42501';
  end if;
  if v_chat.status <> 'date_planned' then
    raise exception 'no confirmed plan to cancel' using errcode = 'P0001';
  end if;

  update public.chats
  set status = 'open',
      date_plan = null,
      fuse_expires_at = now() + make_interval(hours => v_rearm),
      -- The stamp belongs to the fuse, not to the chat. A new countdown is a
      -- new warning.
      fuse_warned_at = null
  where id = p_chat_id;

  perform public.audit('chat.plan_cancelled', 'chat', p_chat_id, '{}'::jsonb);
end;
$$;

revoke all on function public.cancel_date_plan(uuid) from public, anon;
grant execute on function public.cancel_date_plan(uuid) to authenticated;

-- ── 4. two referral rewards shared one source string ─────────────────────────
-- On the third conversion the referrer earns TWO premium grants: the ordinary
-- per-conversion 14 days, and the tier-one 30-day bonus. Both were written with
-- the source 'referral:<conversion>:referrer', and the uniqueness index added
-- this morning then silently dropped the second — so the fix for double-granting
-- turned into a fix for granting at all. The bonus vanished with no error.
-- Dropped first, AGAIN. A defaulted parameter does not replace a function, it
-- creates another one — and I made this exact mistake twelve hours ago adding
-- p_role. The four-argument form has to go or every call is ambiguous.
drop function if exists public.grant_referral_premium(uuid, uuid, integer, text);

create or replace function public.grant_referral_premium(
  p_conversion_id uuid,
  p_user_id uuid,
  p_days integer,
  p_role text default 'referrer',
  p_reason text default 'conversion'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_not_end_user('grant_referral_premium');

  if p_role not in ('referrer', 'invitee') then
    raise exception 'a referral grant is for the referrer or the invitee' using errcode = '22023';
  end if;
  if p_reason not in ('conversion', 'tier') then
    raise exception 'a referral grant is for a conversion or a tier' using errcode = '22023';
  end if;

  insert into public.premium_grants (user_id, source, expires_at)
  values (
    p_user_id,
    -- Role AND reason. Two different rewards for the same person on the same
    -- conversion are two rows, and each is still idempotent on its own.
    'referral:' || p_conversion_id::text || ':' || p_role || ':' || p_reason,
    greatest(
      now(),
      coalesce((select max(expires_at) from public.premium_grants where user_id = p_user_id), now())
    ) + make_interval(days => p_days)
  )
  on conflict (user_id, source) do nothing;
end;
$$;

revoke all on function public.grant_referral_premium(uuid, uuid, integer, text, text)
  from public, anon, authenticated;

drop function if exists public.unrewarded_conversions();

create function public.unrewarded_conversions()
returns table (
  conversion_id uuid,
  referrer_id uuid,
  invitee_id uuid,
  verified_at timestamptz,
  referrer_conversion_count bigint,
  referrer_paid boolean,
  invitee_paid boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    rc.id,
    rc.referrer_id,
    rc.invitee_id,
    rc.verified_at,
    (
      select count(*) from public.referral_conversions prior
      where prior.referrer_id = rc.referrer_id
        and prior.verified_at is not null
        and prior.verified_at <= rc.verified_at
    ),
    -- The per-conversion grant is what "paid" means for each side. A tier bonus
    -- is extra and settles on its own row.
    exists (
      select 1 from public.premium_grants g
      where g.source = 'referral:' || rc.id::text || ':referrer:conversion'
    ),
    exists (
      select 1 from public.premium_grants g
      where g.source = 'referral:' || rc.id::text || ':invitee:conversion'
    )
  from public.referral_conversions rc
  where rc.verified_at is not null
    and not (
      exists (select 1 from public.premium_grants g
               where g.source = 'referral:' || rc.id::text || ':referrer:conversion')
      and exists (select 1 from public.premium_grants g
                   where g.source = 'referral:' || rc.id::text || ':invitee:conversion')
    )
  order by rc.verified_at asc;
$$;

revoke all on function public.unrewarded_conversions() from public, anon, authenticated;

-- ── 5. the blurred preview view had no viewer wall ───────────────────────────
-- preview_profile_photos checked that the VIEWER is support-only and that
-- preview_permitted(owner) passes, but nothing tied the row to somebody the
-- viewer may actually see — so a support-only member could enumerate photo
-- owners by querying it directly. Blurred, but still an answer to "does this
-- person have a photo here", which is the question this whole app exists to not
-- answer about anybody.
create or replace view public.preview_profile_photos
with (security_invoker = false, security_barrier = true)
as
  select
    ph.user_id,
    ph.id,
    ph.position,
    ph.blurred_path as path,
    true as is_blurred
  from public.profile_photos ph
  join public.profiles viewer on viewer.id = (select auth.uid())
  where
    viewer.mode = 'support_only'
    and public.preview_permitted(ph.user_id)
    -- The same wall every other read of another member goes through.
    and exists (select 1 from public.preview_profiles p where p.id = ph.user_id)
    and ph.blurred_path is not null;

revoke all on public.preview_profile_photos from public, anon;
grant select on public.preview_profile_photos to authenticated;

-- ── 6. times_served_count scanned every drop, per candidate ──────────────────
-- A sequential scan of `drops` for each of up to a few hundred candidates, on
-- the screen every member opens at 8pm. GIN over the id array turns the
-- membership test into an index lookup.
create index if not exists drops_served_profile_ids_gin
  on public.drops using gin (served_profile_ids);

-- ── 7. an integer config value out of range still bricked the reader ─────────
-- The regex accepted any run of digits, and config_int casts to a 4-byte
-- integer — so '99999999999' passed validation and then raised on every read.
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

  select c.value into v_old from public.app_config c where c.key = p_key;
  if not exists (select 1 from public.app_config c where c.key = p_key) then
    raise exception 'unknown config key: %', p_key using errcode = '22023';
  end if;

  if jsonb_typeof(p_value) not in ('number', 'object') then
    raise exception 'config values are numbers or objects' using errcode = '22023';
  end if;

  if p_key not like 'drop.weights.%' and jsonb_typeof(p_value) = 'number' then
    if (p_value #>> '{}') !~ '^-?[0-9]+$' then
      raise exception 'config values are numbers or objects' using errcode = '22023';
    end if;
    -- And it has to survive the cast config_int will make.
    if (p_value #>> '{}')::numeric not between -2147483648 and 2147483647 then
      raise exception 'config values are numbers or objects' using errcode = '22023';
    end if;
  end if;

  update public.app_config
  set value = p_value, updated_by = (select auth.uid()), updated_at = now()
  where key = p_key;

  perform public.audit(
    'config.set', 'app_config', null,
    jsonb_build_object('key', p_key, 'from', v_old, 'to', p_value)
  );
end;
$$;

revoke all on function public.admin_set_config(text, jsonb) from public, anon;
grant execute on function public.admin_set_config(text, jsonb) to authenticated;
