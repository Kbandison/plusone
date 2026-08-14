-- Plus One — state transition RPCs (spec §5.3.4)
--
-- Every mechanic transition happens here. Each function validates the caller,
-- the walls, the cooldowns and the budgets, then writes an audit-safe log row —
-- opaque IDs and enum values only, never a message body, profile field, or any
-- condition data (§9.6).
--
-- These are SECURITY DEFINER: they bypass RLS by design, so each one re-derives
-- the caller from auth.uid() and never trusts an argument for identity.

create or replace function public.audit(
  p_action text,
  p_subject_type text,
  p_subject_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.audit_log (actor_id, action, subject_type, subject_id, metadata)
  values ((select auth.uid()), p_action, p_subject_type, p_subject_id, p_metadata);
$$;

-- ── create_connect (§6.3) ─────────────────────────────────────────────────────
-- Walls and budgets are enforced by the connects trigger, which runs whatever
-- path the insert arrives by. This wrapper exists for ergonomics and auditing.
create or replace function public.create_connect(
  p_target_id uuid,
  p_prompt_id text,
  p_prompt_reply text,
  p_source public.connect_source,
  p_room_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := (select auth.uid());
  v_id uuid;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.connects (initiator_id, target_id, prompt_id, prompt_reply, source, room_id)
  values (v_caller, p_target_id, p_prompt_id, p_prompt_reply, p_source, p_room_id)
  returning id into v_id;

  perform public.audit('connect.created', 'connect', v_id,
    jsonb_build_object('source', p_source));

  return v_id;
end;
$$;

-- ── accept_connect ────────────────────────────────────────────────────────────
create or replace function public.accept_connect(p_connect_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := (select auth.uid());
  v_connect public.connects%rowtype;
  v_chat_id uuid;
  v_fuse_hours integer := public.config_int('fuse.window_hours', 168);
begin
  select * into v_connect from public.connects where id = p_connect_id for update;

  if v_connect.id is null then
    raise exception 'connect not found' using errcode = 'P0002';
  end if;
  if v_connect.target_id <> v_caller then
    raise exception 'only the recipient may accept' using errcode = '42501';
  end if;
  if v_connect.status <> 'pending' then
    raise exception 'connect is already %', v_connect.status using errcode = 'P0001';
  end if;

  update public.connects
  set status = 'accepted', decided_at = now()
  where id = p_connect_id;

  -- The chat opens with the fuse armed (Decision #13).
  insert into public.chats (connect_id, status, fuse_expires_at)
  values (p_connect_id, 'open', now() + make_interval(hours => v_fuse_hours))
  returning id into v_chat_id;

  perform public.audit('connect.accepted', 'connect', p_connect_id, '{}'::jsonb);
  return v_chat_id;
end;
$$;

-- ── decline_connect ───────────────────────────────────────────────────────────
-- A decline always carries a note. There is no silent path out of this function.
create or replace function public.decline_connect(
  p_connect_id uuid,
  p_template smallint default 0,
  p_personal_line text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := (select auth.uid());
  v_connect public.connects%rowtype;
begin
  select * into v_connect from public.connects where id = p_connect_id for update;

  if v_connect.id is null then
    raise exception 'connect not found' using errcode = 'P0002';
  end if;
  if v_connect.target_id <> v_caller then
    raise exception 'only the recipient may decline' using errcode = '42501';
  end if;
  if v_connect.status <> 'pending' then
    raise exception 'connect is already %', v_connect.status using errcode = 'P0001';
  end if;

  update public.connects
  set status = 'declined',
      decided_at = now(),
      decline_template = coalesce(p_template, 0),
      decline_personal_line = p_personal_line
  where id = p_connect_id;

  -- Template index only. The personal line itself is never logged.
  perform public.audit('connect.declined', 'connect', p_connect_id,
    jsonb_build_object('template', coalesce(p_template, 0)));
end;
$$;

-- ── date plans (§6.2) ─────────────────────────────────────────────────────────
-- BOTH participants must confirm a concrete plan before the fuse clears. The
-- first call proposes; the second confirms. Until then the fuse keeps running.
create or replace function public.propose_date_plan(p_chat_id uuid, p_plan jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  if not public.is_chat_participant(p_chat_id, v_caller) then
    raise exception 'not a participant' using errcode = '42501';
  end if;
  if not public.chat_accepts_messages(p_chat_id) then
    raise exception 'chat is closed' using errcode = 'P0001';
  end if;
  if p_plan is null or p_plan->>'date' is null or p_plan->>'time' is null
     or p_plan->>'place' is null then
    raise exception 'a plan needs a date, a rough time, and a place or video'
      using errcode = 'P0001';
  end if;

  update public.chats
  set date_plan = jsonb_build_object(
        'plan', p_plan,
        'proposed_by', v_caller,
        'confirmed_by', null
      )
  where id = p_chat_id;

  perform public.audit('chat.plan_proposed', 'chat', p_chat_id, '{}'::jsonb);
end;
$$;

create or replace function public.confirm_date_plan(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := (select auth.uid());
  v_chat public.chats%rowtype;
  v_proposer uuid;
begin
  select * into v_chat from public.chats where id = p_chat_id for update;

  if not public.is_chat_participant(p_chat_id, v_caller) then
    raise exception 'not a participant' using errcode = '42501';
  end if;
  if v_chat.status <> 'open' then
    raise exception 'chat is %', v_chat.status using errcode = 'P0001';
  end if;
  if v_chat.date_plan is null then
    raise exception 'no plan to confirm' using errcode = 'P0001';
  end if;

  v_proposer := (v_chat.date_plan->>'proposed_by')::uuid;
  if v_proposer = v_caller then
    raise exception 'the other person still needs to confirm this plan'
      using errcode = 'P0001';
  end if;

  -- Both sides are now on the same concrete plan: the fuse clears.
  update public.chats
  set status = 'date_planned',
      fuse_expires_at = null,
      date_plan = jsonb_set(v_chat.date_plan, '{confirmed_by}', to_jsonb(v_caller))
  where id = p_chat_id;

  perform public.audit('chat.plan_confirmed', 'chat', p_chat_id, '{}'::jsonb);
end;
$$;

-- A cancelled plan re-arms the fuse rather than closing the chat (§6.2).
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
      fuse_expires_at = now() + make_interval(hours => v_rearm)
  where id = p_chat_id;

  perform public.audit('chat.plan_cancelled', 'chat', p_chat_id, '{}'::jsonb);
end;
$$;

-- ── close_chat ────────────────────────────────────────────────────────────────
-- Manual close. The template is mandatory; the personal line is optional and is
-- tone-checked in packages/logic/tone before it ever reaches this function.
create or replace function public.close_chat(
  p_chat_id uuid,
  p_template smallint default 0,
  p_personal_line text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := (select auth.uid());
  v_chat public.chats%rowtype;
begin
  select * into v_chat from public.chats where id = p_chat_id for update;

  if not public.is_chat_participant(p_chat_id, v_caller) then
    raise exception 'not a participant' using errcode = '42501';
  end if;
  if v_chat.status not in ('open', 'date_planned') then
    raise exception 'chat is already %', v_chat.status using errcode = 'P0001';
  end if;

  update public.chats
  set status = 'closed_by_member',
      fuse_expires_at = null,
      closure_template = coalesce(p_template, 0),
      closure_personal_line = p_personal_line,
      closed_by = v_caller,
      closed_at = now()
  where id = p_chat_id;

  perform public.audit('chat.closed_by_member', 'chat', p_chat_id,
    jsonb_build_object('template', coalesce(p_template, 0)));
end;
$$;

-- ── switch_mode (§6.4, Decision #20) ──────────────────────────────────────────
create or replace function public.switch_mode(p_mode public.member_mode)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
  v_cooldown integer := public.config_int('cooldowns.dating_reentry_days', 30);
begin
  select * into v_profile from public.profiles where id = v_caller for update;

  if v_profile.id is null then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  if v_profile.mode = p_mode then
    return;
  end if;

  if p_mode = 'support_only' then
    -- Always instant. The shield is never gated.
    update public.profiles
    set mode = 'support_only',
        mode_dating_reentry_at = now() + make_interval(days => v_cooldown)
    where id = v_caller;
  else
    -- Instant on first switch; thereafter the cooldown applies. This blocks
    -- toggle-flicker gaming, not genuine re-entry.
    if v_profile.mode_dating_reentry_at is not null
       and now() < v_profile.mode_dating_reentry_at then
      raise exception 'dating re-entry is available on %',
        to_char(v_profile.mode_dating_reentry_at, 'YYYY-MM-DD')
        using errcode = 'P0001';
    end if;

    update public.profiles set mode = 'dating' where id = v_caller;
  end if;

  perform public.audit('profile.mode_switched', 'profile', v_caller,
    jsonb_build_object('mode', p_mode));
end;
$$;

-- ── change_intention (§6.4, Decision #8) ──────────────────────────────────────
create or replace function public.change_intention(p_intention public.intention)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
  v_cooldown integer := public.config_int('cooldowns.intention_change_days', 30);
begin
  select * into v_profile from public.profiles where id = v_caller for update;

  if v_profile.id is null then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  if v_profile.intention = p_intention then
    return;
  end if;

  -- "You can change this once every 30 days, so it means something."
  if now() < v_profile.intention_changed_at + make_interval(days => v_cooldown) then
    raise exception 'intention can change again on %',
      to_char(v_profile.intention_changed_at + make_interval(days => v_cooldown), 'YYYY-MM-DD')
      using errcode = 'P0001';
  end if;

  update public.profiles
  set intention = p_intention, intention_changed_at = now()
  where id = v_caller;

  perform public.audit('profile.intention_changed', 'profile', v_caller,
    jsonb_build_object('intention', p_intention));
end;
$$;

-- ── request_deletion (§9.3) ───────────────────────────────────────────────────
create or replace function public.request_deletion()
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := (select auth.uid());
  v_days integer := public.config_int('deletion.purge_after_days', 7);
  v_purge_after timestamptz := now() + make_interval(days => v_days);
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.deletion_requests (user_id, purge_after, status)
  values (v_caller, v_purge_after, 'requested')
  on conflict (user_id) do update
    set requested_at = now(), purge_after = excluded.purge_after, status = 'requested'
  returning purge_after into v_purge_after;

  -- The member leaves every dating surface immediately, not in seven days.
  update public.profiles set mode = 'support_only' where id = v_caller;

  perform public.audit('account.deletion_requested', 'profile', v_caller, '{}'::jsonb);
  return v_purge_after;
end;
$$;
