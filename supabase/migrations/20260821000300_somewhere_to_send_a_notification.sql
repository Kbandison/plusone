-- §8 is built and cannot deliver anything.
--
-- The payload builder, the content-blind check, the channel planner and the
-- provider seam have all existed since Milestone 1. What has never existed is
-- an address: nothing anywhere records where a member's device can be reached,
-- so `planDeliveries("drop_ready", …)` returns a delivery for the "push"
-- channel and no push has ever been possible.
--
-- That became urgent when the drop started landing at 20:00 rather than
-- whenever a member first opened the app. A nightly ritual nobody is told about
-- is a nightly ritual that does not happen.
--
-- One table for both transports. A web push subscription is an endpoint URL
-- plus two RFC 8291 keys; a native one is an APNs or FCM token and no keys.
-- They are the same fact — "this device, for this member" — and splitting them
-- would mean two tables, two policies and two purge paths for one idea.
create table if not exists public.push_subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  -- The address. A web push endpoint URL, or a native device token.
  --
  -- Unique on its own, not per member: an endpoint identifies a browser
  -- install, and if somebody signs out and a second member signs in on the same
  -- phone, that address now belongs to the second one. The upsert below moves
  -- it. Keyed per member instead, the first member would keep receiving the
  -- second member's notifications on a device they no longer hold.
  endpoint text not null unique,

  -- RFC 8291, web push only. Null for a native token, which is why these are
  -- nullable and the check below ties them to the platform rather than to each
  -- other individually.
  p256dh text,
  auth text,

  platform text not null default 'web',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  constraint push_subscriptions_platform check (platform in ('web', 'ios', 'android')),
  -- Web push cannot be encrypted without both keys, so a web row missing one is
  -- an address that will fail on every send. Refused at write time instead.
  constraint push_subscriptions_web_keys check (
    platform <> 'web' or (p256dh is not null and auth is not null)
  )
);

create index if not exists push_subscriptions_user_ix
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Supabase's default privileges hand every role everything on a NEW object in
-- this schema. 20260813000700 revoked that once, before this table existed —
-- and this is the seventh object to need it said again.
revoke all on public.push_subscriptions from anon, authenticated;

-- A member may register and remove their own device, and read nothing.
--
-- No select grant at all, deliberately. The browser already knows its own
-- subscription — `registration.pushManager.getSubscription()` — so a member
-- needs nothing from this table to answer "is this device on?", and a readable
-- row is a list of somebody's devices sitting behind one RLS mistake.
grant insert (user_id, endpoint, p256dh, auth, platform) on public.push_subscriptions to authenticated;
grant delete on public.push_subscriptions to authenticated;

create policy "members register their own devices"
  on public.push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "members remove their own devices"
  on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

comment on table public.push_subscriptions is
  'Where a member''s devices can be reached. One row per device per transport; the endpoint is unique across members so a shared phone follows whoever is signed in.';

-- ── registering a device ─────────────────────────────────────────────────────
--
-- An RPC rather than an insert, because the interesting case is not the first
-- registration: it is the same browser coming back. A plain insert conflicts on
-- the endpoint, and the conflict is the normal path — a subscription is
-- re-registered on every load, and a phone that changed hands must move.
create or replace function public.register_push_device(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_platform text default 'web'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if coalesce(trim(p_endpoint), '') = '' then
    raise exception 'a device needs an address' using errcode = '22023';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, platform)
  values (v_uid, p_endpoint, p_p256dh, p_auth, coalesce(p_platform, 'web'))
  on conflict (endpoint) do update
    -- The member as well as the timestamp. This is the shared-phone case, and
    -- it is the reason this is an upsert rather than an insert-if-missing.
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        platform = excluded.platform,
        last_seen_at = now();
end;
$$;

revoke all on function public.register_push_device(text, text, text, text) from public, anon;
grant execute on function public.register_push_device(text, text, text, text) to authenticated;

comment on function public.register_push_device(text, text, text, text) is
  'Registers or refreshes the calling member''s device address. Upserts on the endpoint so a re-subscription updates rather than conflicts, and a device that changed hands follows the member now signed in.';

-- ── who to send to ───────────────────────────────────────────────────────────
--
-- Service role only. This is the one read of the table and it exists for the
-- dispatcher, which runs in a cron route with the service client — the same
-- shape as every other sweep here.
create or replace function public.push_devices_for(p_user_ids uuid[])
returns table (
  user_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  platform text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.user_id, s.endpoint, s.p256dh, s.auth, s.platform
    from public.push_subscriptions s
   where s.user_id = any (p_user_ids);
$$;

revoke all on function public.push_devices_for(uuid[]) from public, anon, authenticated;

comment on function public.push_devices_for(uuid[]) is
  'Device addresses for a set of members. Service role only — a member-callable version would turn any uuid into a device census.';

-- ── forgetting a dead one ────────────────────────────────────────────────────
--
-- A push endpoint dies when the member clears their browser data, uninstalls,
-- or revokes permission, and the provider says so with a 404 or a 410. Keeping
-- it means retrying a known-dead address on every send forever.
create or replace function public.forget_push_device(p_endpoint text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

revoke all on function public.forget_push_device(text) from public, anon, authenticated;

comment on function public.forget_push_device(text) is
  'Removes a device address the provider has reported as gone (404/410). Service role only: it takes an endpoint rather than a member, so a member-callable version would let anyone unsubscribe anyone.';
