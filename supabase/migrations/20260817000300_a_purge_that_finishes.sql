-- Three ways hard delete (§9.3) did not do what it promises.
--
-- 1. ONE ROOM REPORT COULD BREAK IT FOR EVERYONE, PERMANENTLY.
--    reports.reported_room_message_id is ON DELETE SET NULL, and
--    reports_has_subject requires at least one of the three subject columns to
--    be non-null. A room report is filed with ONLY the room-message id — the
--    room page renders ReportControl with a roomMessageId and no memberId — so
--    when the AUTHOR is purged, room_messages cascades, SET NULL fires, all
--    three columns are null, and the CHECK aborts the whole DELETE. The purge
--    then fails for every member due that night, and every night after.
--
--    The fix is to give every report a subject at insert time. A report about a
--    message is a report about whoever wrote it, and resolving that here also
--    fixes the moderation queue, which read new.reported_user_id and so showed
--    room reports with no author and no action available.
--
-- 2. VOICE NOTES SURVIVED. The storage loop swept `photos` and
--    `verification-selfies`. `voice-notes` was added later and was never
--    listed — and could not have been by user id anyway, because its paths are
--    <chat_id>/<message_id>, keyed on the chat so the storage policy can
--    express participation. Deleting auth.users cascades the messages rows that
--    were the only index into those objects, so what was left was an
--    unreferenced, undiscoverable, permanent recording of the voice of someone
--    who asked to be forgotten.
--
-- 3. THE STRIPE SUBSCRIPTION WAS NEVER CANCELLED. §9.3 asks for a customer
--    detach; the route never called Stripe, and the cascade removed the
--    subscriptions row holding the only mapping from member to customer. A
--    deleted member kept being charged monthly with nothing left to reconcile
--    against.
--
-- 2 and 3 need the same thing: read what the cascade is about to destroy,
-- BEFORE it runs.

-- ── every report names a person ───────────────────────────────────────────────
create or replace function public.resolve_report_subject()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.reported_user_id is null then
    if new.reported_room_message_id is not null then
      select rm.user_id into new.reported_user_id
        from public.room_messages rm where rm.id = new.reported_room_message_id;
    elsif new.reported_message_id is not null then
      select m.sender_id into new.reported_user_id
        from public.messages m where m.id = new.reported_message_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists reports_resolve_subject on public.reports;
create trigger reports_resolve_subject
  before insert on public.reports
  for each row execute function public.resolve_report_subject();

-- Existing rows, so the CHECK cannot be tripped by history either.
update public.reports r
   set reported_user_id = rm.user_id
  from public.room_messages rm
 where r.reported_user_id is null
   and r.reported_room_message_id = rm.id;

update public.reports r
   set reported_user_id = m.sender_id
  from public.messages m
 where r.reported_user_id is null
   and r.reported_message_id = m.id;

-- ── what the cascade is about to destroy ──────────────────────────────────────
/**
 * Everything the purge needs to clean up OUTSIDE the database, read before the
 * rows are gone.
 *
 * Deliberately separate from purge_due_deletions and deliberately read-only: it
 * selects the same due set without marking or deleting anything, so calling it
 * twice is harmless and a crash between the two calls loses nothing.
 *
 * Voice notes are the member's OWN voice — messages they sent. A recording of
 * the other person in the chat is not theirs to have deleted.
 */
create or replace function public.purge_targets()
returns table (
  user_id uuid,
  stripe_customer_id text,
  stripe_sub_id text,
  voice_note_paths text[]
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_not_end_user('purge_targets');

  return query
  with due as (
    select d.user_id from public.deletion_requests d
    where d.status = 'requested' and d.purge_after <= now()
  )
  select
    due.user_id,
    s.stripe_customer_id,
    s.stripe_sub_id,
    coalesce(
      (select array_agg(m.voice_note_path)
         from public.messages m
        where m.sender_id = due.user_id
          and m.voice_note_path is not null
          and m.voice_note_path <> 'pending'),
      array[]::text[]
    )
  from due
  left join public.subscriptions s on s.user_id = due.user_id;
end;
$$;

revoke all on function public.purge_targets() from public, anon, authenticated;
