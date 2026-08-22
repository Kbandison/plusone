-- In-app notifications, and a switch for every one of them.
--
-- §8 built the payload, the channel planner and the content-blind check, and
-- push finally delivers. What has never existed is a place a member can LOOK.
-- A push is a moment: dismiss it, or have the phone face down, and the thing
-- that happened is gone. Everything in this app that matters — a connect, a
-- reply, a plan, a fuse about to run out — arrived exactly once or not at all.
--
-- ── the row stores what happened, never a sentence ───────────────────────────
--
-- A notification here is an event and two references. It carries no text.
--
-- That is not economy, it is the same wall argument the rest of the schema
-- makes. A stored sentence freezes the world as it was when it was written: the
-- name of somebody since blocked, the author of a post written anonymously, a
-- member since deleted. Storing the FACT and rendering it at read time means
-- the reader's own permissions decide what it says, every time they look. The
-- same reason room_feed() exists rather than a denormalised author column.
--
-- It also keeps §8's guarantee intact. buildPayload stays the only way to make
-- a push or an email, and it still refuses a condition word. In-app is behind
-- the login on a screen already showing names, so it can afford to say more —
-- but it says more by RENDERING more, not by storing more.

create table if not exists public.notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event text not null,

  /**
   * Who caused it, if anyone did.
   *
   * Null for a drop, a fuse warning, a premium reminder — things the system
   * does. Never rendered raw: the list resolves it through visible_profiles, so
   * a member who has since been blocked simply has no name to show.
   */
  actor_id uuid references public.profiles (id) on delete set null,

  /**
   * What it is about — a chat, a connect, a room post. Untyped on purpose: a
   * foreign key per kind would be five nullable columns and five cascades, and
   * nothing here dereferences it without going through a wall that would refuse
   * a stale id anyway.
   */
  subject_id uuid,

  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_unread_ix
  on public.notifications (user_id, created_at desc)
  where read_at is null;

create index if not exists notifications_recent_ix
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

-- Supabase's default privileges hand every role everything on a NEW object in
-- this schema. The eighth object to need this said again.
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

create policy "members read their own notifications"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

-- No insert or update grant. Notifications are written by definer functions on
-- the member's behalf, and marked read through an RPC — a member who could
-- INSERT here could put a notification in somebody else's list.

comment on table public.notifications is
  'What happened, for one member. Stores an event and references, never a sentence: the list is rendered at read time so the reader''s own permissions decide what it says.';

-- ── the switches ─────────────────────────────────────────────────────────────
--
-- Only the OFF switches are stored. A row means "do not send me this, here";
-- absence means the default in NOTIFICATION_DEFAULTS. That way a member who has
-- never touched the settings has no rows at all, and changing a default later
-- reaches everybody who never expressed a preference — which is what a default
-- is for.
create table if not exists public.notification_mutes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  event text not null,
  channel text not null,
  created_at timestamptz not null default now(),

  primary key (user_id, event, channel),
  constraint notification_mutes_channel check (channel in ('in_app', 'push', 'email'))
);

alter table public.notification_mutes enable row level security;
revoke all on public.notification_mutes from anon, authenticated;
grant select on public.notification_mutes to authenticated;

create policy "members read their own mutes"
  on public.notification_mutes for select to authenticated
  using (user_id = (select auth.uid()));

-- Written through the RPC below rather than directly, so the event and channel
-- are checked against the lists the app actually knows about.
comment on table public.notification_mutes is
  'The OFF switches only. Absence means the configured default, so changing a default reaches everyone who never expressed a preference.';

-- ── writing one ──────────────────────────────────────────────────────────────
--
-- Returns the channels that should still be attempted, so one call both records
-- the in-app copy and tells the caller whether to bother with push or email.
create or replace function public.notify_member(
  p_user_id uuid,
  p_event text,
  p_default_channels text[],
  p_actor_id uuid default null,
  p_subject_id uuid default null
)
returns table (channel text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Never yourself. Every caller has a "who did it" and a "who it is about",
  -- and on a like, a reply or a plan those are the same person often enough
  -- that checking here is better than remembering at nine call sites.
  if p_user_id is null or p_user_id = p_actor_id then
    return;
  end if;

  if 'in_app' = any (p_default_channels)
     and not exists (
       select 1 from public.notification_mutes m
        where m.user_id = p_user_id and m.event = p_event and m.channel = 'in_app'
     ) then
    insert into public.notifications (user_id, event, actor_id, subject_id)
    values (p_user_id, p_event, p_actor_id, p_subject_id);
  end if;

  return query
  select c
    from unnest(p_default_channels) as t(c)
   where c <> 'in_app'
     and not exists (
       select 1 from public.notification_mutes m
        where m.user_id = p_user_id and m.event = p_event and m.channel = t.c
     );
end;
$$;

revoke all on function public.notify_member(uuid, text, text[], uuid, uuid) from public, anon, authenticated;

comment on function public.notify_member(uuid, text, text[], uuid, uuid) is
  'Records the in-app copy if it is not muted, and returns the remaining channels the caller should attempt. Refuses to notify somebody about their own action.';

-- ── reading them ─────────────────────────────────────────────────────────────
--
-- Resolves the actor through visible_profiles, so a name the member may no
-- longer see is simply absent rather than stale. Anonymity holds for the same
-- reason: nothing here reads room_messages.
create or replace function public.my_notifications(p_limit integer default 50)
returns table (
  id uuid,
  event text,
  actor_name text,
  subject_id uuid,
  created_at timestamptz,
  read_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    n.id,
    n.event,
    v.display_name,
    n.subject_id,
    n.created_at,
    n.read_at
  from public.notifications n
  left join public.visible_profiles v on v.id = n.actor_id
  where n.user_id = (select auth.uid())
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

grant execute on function public.my_notifications(integer) to authenticated;

comment on function public.my_notifications(integer) is
  'The caller''s notifications, newest first, with the actor resolved through visible_profiles — so somebody since blocked has no name rather than a stale one. security invoker: the table policy is the wall.';

create or replace function public.mark_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_marked integer;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  update public.notifications
     set read_at = now()
   where user_id = v_uid and read_at is null;

  get diagnostics v_marked = row_count;
  return v_marked;
end;
$$;

revoke all on function public.mark_notifications_read() from public, anon;
grant execute on function public.mark_notifications_read() to authenticated;

-- ── the switches, set ────────────────────────────────────────────────────────
create or replace function public.set_notification_mute(
  p_event text,
  p_channel text,
  p_muted boolean
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
  if p_channel not in ('in_app', 'push', 'email') then
    raise exception 'no such channel' using errcode = '22023';
  end if;
  -- The one that cannot be silenced. A member waiting on a human review has
  -- nothing to do but check, and a switch for it is a switch for stranding
  -- yourself — see MUTABLE_EVENTS.
  if p_event = 'verification_decided' then
    raise exception 'that one cannot be turned off' using errcode = '22023';
  end if;

  if p_muted then
    insert into public.notification_mutes (user_id, event, channel)
    values (v_uid, p_event, p_channel)
    on conflict (user_id, event, channel) do nothing;
  else
    delete from public.notification_mutes
     where user_id = v_uid and event = p_event and channel = p_channel;
  end if;
end;
$$;

revoke all on function public.set_notification_mute(text, text, boolean) from public, anon;
grant execute on function public.set_notification_mute(text, text, boolean) to authenticated;
