-- The reports queue (§7.3).
--
-- Reports have reached the moderation queue since 20260815000200 and nothing
-- displayed them. Same half-built loop as the purge job with no delete button
-- and the report with no reader — a queue nobody can open is a queue.
--
-- Everything here returns what a moderator needs to make ONE decision, and
-- nothing else. Notably absent: the reported member's community, condition or
-- U=U badge. Deciding whether a message was abusive does not require knowing
-- anybody's diagnosis, and §7.3 says condition data is never shown by default.
-- `admin_reveal_condition` remains the only way to it, and still writes the
-- reason down in the same statement as the read.

create or replace function public.admin_open_reports()
returns table (
  queue_id uuid,
  kind public.moderation_kind,
  reported_user_id uuid,
  reported_display_name text,
  reporter_id uuid,
  reason public.report_reason,
  detail text,
  -- The reported text itself. A moderator cannot judge a report without it,
  -- and it is already visible to the reporter who sent it in.
  reported_body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    m.id,
    m.kind,
    m.subject_user_id,
    p.display_name,
    r.reporter_id,
    r.reason,
    r.detail,
    coalesce(msg.body, room_msg.body),
    m.created_at
  from public.moderation_queue m
  join public.reports r on r.id = m.report_id
  left join public.profiles p on p.id = m.subject_user_id
  left join public.messages msg on msg.id = r.reported_message_id
  left join public.room_messages room_msg on room_msg.id = r.reported_room_message_id
  where public.is_admin()
    and m.status = 'open'
    and m.kind in ('user_report', 'message_report', 'room_message_report')
  order by m.created_at asc;
$$;

comment on function public.admin_open_reports() is
  'Open reports for a moderator. Returns no condition data — see admin_reveal_condition.';

-- ── deciding ──────────────────────────────────────────────────────────────────
create or replace function public.admin_resolve_report(
  p_queue_id uuid,
  p_status public.moderation_status,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subject uuid;
begin
  if not public.is_admin() then
    raise exception 'not an administrator' using errcode = '42501';
  end if;

  -- Only these two. 'open' and 'in_review' are states a queue moves through,
  -- not decisions; letting this set them would make "resolved" reachable and
  -- reversible by the same call, and an audit trail of a decision that can be
  -- un-decided is not much of a trail.
  if p_status not in ('resolved', 'dismissed') then
    raise exception 'a report is resolved or dismissed' using errcode = '22023';
  end if;

  update public.moderation_queue
  set status = p_status, resolved_at = now(), assigned_to = (select auth.uid())
  where id = p_queue_id and status = 'open'
  returning subject_user_id into v_subject;

  if not found then
    raise exception 'no open report with that id' using errcode = 'P0002';
  end if;

  perform public.audit(
    'report.decide', 'moderation_queue', p_queue_id,
    jsonb_build_object('status', p_status, 'note', p_note, 'subject', v_subject)
  );
end;
$$;

-- ── member lookup (§7.3) ──────────────────────────────────────────────────────
-- Deliberately thin. A moderator looking someone up needs to know they exist,
-- whether they are verified, and how to reach the reports about them. Anything
-- more is a directory of members' private details with a search box on it.
create or replace function public.admin_member_lookup(p_query text)
returns table (
  user_id uuid,
  display_name text,
  verification_status public.verification_status,
  created_at timestamptz,
  open_reports bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.display_name,
    p.verification_status,
    p.created_at,
    (select count(*) from public.moderation_queue m
      where m.subject_user_id = p.id and m.status = 'open')
  from public.profiles p
  where public.is_admin()
    and length(btrim(coalesce(p_query, ''))) >= 2
    and (
      p.display_name ilike '%' || btrim(p_query) || '%'
      -- An exact id, for following a report to its subject. Not a prefix
      -- search: browsing the member list by uuid fragment is not lookup.
      or p.id::text = btrim(p_query)
    )
  order by p.created_at desc
  limit 25;
$$;

grant execute on function public.admin_open_reports() to authenticated;
grant execute on function public.admin_resolve_report(uuid, public.moderation_status, text) to authenticated;
grant execute on function public.admin_member_lookup(text) to authenticated;
