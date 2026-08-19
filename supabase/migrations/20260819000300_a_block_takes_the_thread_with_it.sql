-- A block removes the conversation. It does not destroy it.
--
-- Kevin's model, 2026-08-19:
--   · a block hides the thread from both members' inboxes;
--   · the blocked member does not keep a copy at all;
--   · a member who REPORTED keeps theirs, reachable from Settings;
--   · nothing is deleted at the moment of blocking.
--
-- WHY NOT DELETE. Blocking and reporting are two acts, and the common order is
-- block first, report later — in the moment you make it stop, and afterwards,
-- once you have stopped shaking or once somebody asks you to, you file it. §11
-- has a moderator read every report. A report whose thread was deleted at block
-- time is a report nobody can act on, filed by the member least able to absorb
-- being told that. "Gone from view" and "gone from the database" look identical
-- to a member and are nothing alike to a moderator.
--
-- The existing note in 20260817000500 flagged exactly this and left it open:
-- "Hiding them retroactively is a product decision — it also destroys what a
-- member might want to attach to a report."
--
-- WHY THE BLOCKED MEMBER LOSES THEIRS. A preserved thread is somewhere to go
-- and re-read what was said. Somebody who has just been blocked has no use for
-- that which is good for either of them, and the person who blocked them cannot
-- be reached through it anyway.
--
-- RETENTION — CLAUDE'S RECOMMENDATION, NOT KEVIN'S DECISION. Ninety days from
-- the block, and an open report holds the thread past that until it is resolved
-- plus the same ninety. Reasoning, so the number can be argued with:
--
--   · Under 30 days loses the late report, which is the common one.
--   · Health-community message logs are the most sensitive rows in this
--     database. §9 and the consumer-health-data posture both push toward
--     keeping less for less long, so the window should be the shortest one that
--     still lets a moderator do their job.
--   · 90 days is the ordinary safety-retention window and is defensible as data
--     minimisation rather than as convenience.
--   · Tying it to the report's RESOLUTION rather than to its filing is what
--     stops a slow queue from silently destroying its own evidence.
--
-- It is a config key, so changing it is one row and no migration.

alter table public.chats
  add column if not exists blocked_at timestamptz;

comment on column public.chats.blocked_at is
  'When a block hid this thread. Retention runs from here; null means no block.';

-- ── the trigger, extended ─────────────────────────────────────────────────────
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
         -- Stamped, so retention has something to count from and so the read
         -- policy below can tell a blocked-away thread from an ordinary close.
         blocked_at = now(),
         -- The default note, which is what the member is shown either way. Null
         -- here made every block a data point against the one promise the
         -- product measures — see 20260819000200.
         closure_template = 0,
         -- Unsigned and unwritten. Nobody owes a note to someone they have just
         -- blocked, and closed_by staying null is also what makes this read as a
         -- fuse expiry rather than as a person's decision.
         closure_personal_line = null,
         closed_by = null,
         fuse_expires_at = null
    from public.connects k
   where c.connect_id = k.id
     and c.status = 'open'
     and (
       (k.initiator_id = new.blocker_id and k.target_id = new.blocked_id)
       or (k.initiator_id = new.blocked_id and k.target_id = new.blocker_id)
     );

  return new;
end;
$$;

-- ── who may still read a blocked-away thread ──────────────────────────────────
--
-- Participation is no longer the whole test. After a block:
--   · the blocked member reads nothing;
--   · the blocker reads it only if they reported the other member — from
--     Settings, never from the inbox, which is a UI matter and not this one's;
--   · a moderator reads it through the admin path, which does not come here.
create or replace function public.may_read_chat(p_chat_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.chats ch
      join public.connects c on c.id = ch.connect_id
     where ch.id = p_chat_id
       and (c.initiator_id = p_user_id or c.target_id = p_user_id)
       and (
         ch.blocked_at is null
         or (
           -- The blocker, and only if they also reported. Reporting is the act
           -- that says "I may need this again"; a block on its own is the act
           -- that says "take it away".
           exists (
             select 1 from public.blocks b
              where b.blocker_id = p_user_id
                and b.blocked_id = case
                      when c.initiator_id = p_user_id then c.target_id else c.initiator_id end
           )
           and exists (
             select 1 from public.reports r
              where r.reporter_id = p_user_id
                and r.reported_user_id = case
                      when c.initiator_id = p_user_id then c.target_id else c.initiator_id end
           )
         )
       )
  );
$$;

comment on function public.may_read_chat(uuid, uuid) is
  'Whether p_user_id may still read this chat: participation, and after a block only a participant who also reported.';

revoke all on function public.may_read_chat(uuid, uuid) from public, anon;
grant execute on function public.may_read_chat(uuid, uuid) to authenticated;

-- is_chat_participant stays exactly what its name says and keeps guarding
-- WRITES. Overloading it with "and is still allowed to see it" would have made
-- every caller's meaning depend on a rule none of them mention.
drop policy if exists "participants read their chats" on public.chats;
create policy "participants read their chats"
  on public.chats for select to authenticated
  using (public.may_read_chat(id, (select auth.uid())));

drop policy if exists "participants read chat messages" on public.messages;
create policy "participants read chat messages"
  on public.messages for select to authenticated
  using (public.may_read_chat(chat_id, (select auth.uid())));

-- ── the purge ─────────────────────────────────────────────────────────────────
--
-- Deletes the MESSAGES, not the chat. The chat row is the record that a thread
-- existed and how it ended, which metrics and the moderation history both count
-- off; the messages are the sensitive part and the part with a reason to go.
-- Returns the voice-note paths it deleted, because storage cannot cascade.
--
-- The hard-delete route already learned this one the expensive way: a voice
-- note lives at voice-notes/<chat_id>/<message_id> and the row holding that
-- path is exactly what the delete removes, so deleting first and looking after
-- leaves an unreferenced, undiscoverable recording of somebody's actual voice.
-- Reading them out here is what lets the caller clean the bucket.
create or replace function public.sweep_purge_blocked_threads()
returns table (chat_id uuid, voice_note_paths text[])
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_days integer := public.config_int('retention.blocked_thread_days', 90);
  v_purged integer;
begin
  return query
  with due as (
    select ch.id
      from public.chats ch
      join public.connects c on c.id = ch.connect_id
     where ch.blocked_at is not null
       and ch.blocked_at < now() - make_interval(days => v_days)
       -- An open report holds the thread. A slow queue must not be able to
       -- destroy the evidence it has not read yet.
       and not exists (
         select 1
           from public.reports r
           join public.moderation_queue q on q.report_id = r.id
          where q.status = 'open'
            and (
              r.reported_user_id in (c.initiator_id, c.target_id)
              or r.reported_message_id in (select m.id from public.messages m where m.chat_id = ch.id)
            )
       )
       -- And a resolved one holds it for the same window past resolution, so
       -- the clock starts when somebody actually looked rather than when the
       -- report was filed.
       and not exists (
         select 1
           from public.reports r
           join public.moderation_queue q on q.report_id = r.id
          where q.resolved_at is not null
            and q.resolved_at > now() - make_interval(days => v_days)
            and (
              r.reported_user_id in (c.initiator_id, c.target_id)
              or r.reported_message_id in (select m.id from public.messages m where m.chat_id = ch.id)
            )
       )
  ),
  gone as (
    delete from public.messages m
     using due
     where m.chat_id = due.id
     returning m.chat_id as cid, m.voice_note_path as path
  )
  select g.cid, array_remove(array_agg(g.path), null)
    from gone g
   group by g.cid;

  get diagnostics v_purged = row_count;

  if v_purged > 0 then
    -- No ids, no bodies, no member. The count is the whole entry.
    perform public.audit('retention.blocked_messages_purged', 'chat', null,
      jsonb_build_object('threads', v_purged, 'after_days', v_days));
  end if;
end;
$$;

comment on function public.sweep_purge_blocked_threads() is
  'Deletes the messages of blocked-away threads past retention.blocked_thread_days, holding any thread an open or recently-resolved report touches, and returns the voice-note paths for the caller to remove from storage.';

revoke all on function public.sweep_purge_blocked_threads() from public, anon, authenticated;

insert into public.app_config (key, value) values
  ('retention.blocked_thread_days', to_jsonb(90))
on conflict (key) do nothing;
