-- The sweeps (§6.2, §6.3, §9.3).
--
-- Until now the fuse was a countdown that reached zero and did nothing. The
-- reducer was right and the janitor was missing, which meant the product's
-- central promise — "it closes kindly, nobody gets left on read" — was carried
-- entirely by a number on a screen.
--
-- Each of these is one statement wherever it can be, so a sweep either happens
-- or does not. A half-swept fuse is a chat that is closed with no note, which
-- is the exact outcome the fuse exists to prevent.
--
-- All three are callable only by the service role: they act on every member's
-- rows, so there is no version of "as the caller" that makes sense.

-- ── expired fuses close, with a note ──────────────────────────────────────────
create or replace function public.sweep_expired_fuses()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_closed integer;
begin
  -- closure_template is set in the same UPDATE as the status. There is no
  -- ordering in which a chat is closed and the note is still to come: §3.5's
  -- default template (index 0) is what a member gets when they pre-selected
  -- nothing, and it is applied here rather than left null for a later pass.
  with swept as (
    update public.chats
    set status = 'closed_fuse',
        fuse_expires_at = null,
        closure_template = coalesce(closure_template, 0),
        closed_at = now(),
        -- closed_by stays null: the fuse closed this, not a person. That
        -- distinction is what makes the note read as the mechanic rather than
        -- as the other member walking away.
        closed_by = null
    where status = 'open'
      and fuse_expires_at is not null
      and fuse_expires_at <= now()
    returning id
  )
  select count(*)::integer into v_closed from swept;

  return v_closed;
end;
$$;

comment on function public.sweep_expired_fuses() is
  'Closes every chat whose fuse has run out, always with a note. §6.2.';

-- ── chats about to close ──────────────────────────────────────────────────────
-- §8 — "One of your chats closes tomorrow", content-blind. Returns who to tell
-- and nothing about what the chat contains, because the notification may not
-- carry that and a function that returned it would invite one that did.
create or replace function public.fuses_expiring_within(p_hours integer default 24)
returns table (chat_id uuid, user_id uuid, expires_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, p.user_id, c.fuse_expires_at
  from public.chats c
  join public.connects n on n.id = c.connect_id
  cross join lateral (values (n.initiator_id), (n.target_id)) as p(user_id)
  where c.status = 'open'
    and c.fuse_expires_at is not null
    and c.fuse_expires_at > now()
    and c.fuse_expires_at <= now() + make_interval(hours => p_hours);
$$;

-- ── pending connects expire kindly ────────────────────────────────────────────
-- §6.3 — an unanswered connect times out rather than lingering. The note is
-- CONNECT_EXPIRY_NOTE in packages/config; nothing is written into the row here
-- because a decline template belongs to a person who chose it, and nobody did.
create or replace function public.sweep_expired_connects()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expired integer;
begin
  with swept as (
    update public.connects
    set status = 'expired', decided_at = now()
    where status = 'pending'
      and expires_at <= now()
    returning id
  )
  select count(*)::integer into v_expired from swept;

  return v_expired;
end;
$$;

-- ── hard delete ───────────────────────────────────────────────────────────────
-- §9.3, and on the never-cut list. "Deleted" means deleted: this removes the
-- auth user, and every table that references a profile does so with ON DELETE
-- CASCADE, so the rows go with it rather than being individually remembered
-- here. A purge that lists tables is a purge that misses the next one added.
--
-- Storage objects are removed by the caller afterwards; SQL cannot reach them.
create or replace function public.purge_due_deletions()
returns table (purged_user_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with due as (
    select user_id from public.deletion_requests
    where status = 'requested' and purge_after <= now()
    for update skip locked
  ),
  marked as (
    update public.deletion_requests d
    set status = 'purged', purged_at = now()
    from due where d.user_id = due.user_id
    returning d.user_id
  ),
  gone as (
    delete from auth.users u using marked where u.id = marked.user_id
    returning u.id
  )
  select gone.id from gone;
end;
$$;

comment on function public.purge_due_deletions() is
  'Hard delete (§9.3). Removes the auth user; every profile-referencing table cascades.';

-- ── grants ────────────────────────────────────────────────────────────────────
-- Deliberately NOT granted to authenticated. These act across every member, and
-- the service role is the only caller for which that is coherent. Revoking from
-- public as well, since SECURITY DEFINER functions are executable by public by
-- default and that default is how a sweep becomes an anybody-button.
revoke all on function public.sweep_expired_fuses() from public;
revoke all on function public.fuses_expiring_within(integer) from public;
revoke all on function public.sweep_expired_connects() from public;
revoke all on function public.purge_due_deletions() from public;

grant execute on function public.sweep_expired_fuses() to service_role;
grant execute on function public.fuses_expiring_within(integer) to service_role;
grant execute on function public.sweep_expired_connects() to service_role;
grant execute on function public.purge_due_deletions() to service_role;
