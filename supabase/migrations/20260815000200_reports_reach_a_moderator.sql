-- A report nobody is queued to read is a complaint, not a report.
--
-- `reports` and `moderation_queue` have both existed since Milestone 1 and
-- nothing connected them. A member could file a report, the row would land, and
-- no moderator would ever see it — the same shape as the purge job that ran
-- nightly with no way to ask for deletion.
--
-- Verification flags had the same hole from the other side:
-- admin_decide_verification resolves moderation_queue rows that were never
-- created. The admin screen works because it reads `profiles` directly, but the
-- queue — the one place a moderator should be able to look — was empty.
--
-- Both by trigger rather than by the app. A queue entry that depends on the
-- caller remembering is a queue entry that goes missing on the path nobody
-- tested.

create or replace function public.queue_report()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.moderation_queue (kind, subject_user_id, report_id, payload, status)
  values (
    case
      when new.reported_room_message_id is not null then 'room_message_report'
      when new.reported_message_id is not null then 'message_report'
      else 'user_report'
    end,
    new.reported_user_id,
    new.id,
    -- The reason, and nothing else. The detail lives on the report row where a
    -- moderator reads it in context; copying it here would put a member's
    -- account of what happened into a second place with its own lifetime.
    jsonb_build_object('reason', new.reason),
    'open'
  );
  return new;
end;
$$;

drop trigger if exists queue_report on public.reports;

create trigger queue_report
  after insert on public.reports
  for each row
  execute function public.queue_report();

-- ── verification flags ────────────────────────────────────────────────────────
create or replace function public.queue_verification_flag()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.verification_status = 'flagged'
     and coalesce(old.verification_status, 'unverified') <> 'flagged' then
    insert into public.moderation_queue (kind, subject_user_id, status)
    select 'verification_flag', new.id, 'open'
    -- One open entry per member. A member who fails, appeals, and fails again
    -- is one thing to look at, not three.
    where not exists (
      select 1 from public.moderation_queue m
      where m.subject_user_id = new.id
        and m.kind = 'verification_flag'
        and m.status = 'open'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists queue_verification_flag on public.profiles;

create trigger queue_verification_flag
  after update of verification_status on public.profiles
  for each row
  execute function public.queue_verification_flag();

-- Members do not touch the queue. The policy already restricts it to admins;
-- this narrows the grant to match, so the two say the same thing.
revoke insert, update on public.moderation_queue from authenticated;

revoke all on function public.queue_report() from public, anon, authenticated;
revoke all on function public.queue_verification_flag() from public, anon, authenticated;
