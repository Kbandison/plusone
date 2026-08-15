-- Fixes 20260815000200, which could not have worked.
--
--   column "kind" is of type moderation_kind but expression is of type text
--
-- A CASE returning string literals is `text`, and an INSERT ... SELECT of bare
-- literals is `text` too. Postgres will coerce a literal written directly into
-- a column, but not the result of an expression — so both triggers raised on
-- every fire, which meant filing a report failed entirely and flagging a member
-- errored out of whatever was flagging them.
--
-- `pnpm check:sql` parses the grammar and this is grammatically fine. The
-- migration applied cleanly, because creating a function does not run it. Only
-- calling it fails, which is the case for behavioural tests over structural
-- ones: this was found by filing a report as a real member.

create or replace function public.queue_report()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.moderation_queue (kind, subject_user_id, report_id, payload, status)
  values (
    (case
      when new.reported_room_message_id is not null then 'room_message_report'
      when new.reported_message_id is not null then 'message_report'
      else 'user_report'
    end)::public.moderation_kind,
    new.reported_user_id,
    new.id,
    jsonb_build_object('reason', new.reason),
    'open'::public.moderation_status
  );
  return new;
end;
$$;

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
    select
      'verification_flag'::public.moderation_kind,
      new.id,
      'open'::public.moderation_status
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

revoke all on function public.queue_report() from public, anon, authenticated;
revoke all on function public.queue_verification_flag() from public, anon, authenticated;
