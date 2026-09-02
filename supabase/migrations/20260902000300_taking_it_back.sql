-- Unsending a message.
--
-- ── it is a REDACTION, not a delete, and the schema decides that ────────────
--
-- `reports.reported_message_id` is `references public.messages (id) on delete
-- set null` (20260813000200). So a hard delete does not remove a report — it
-- removes the EVIDENCE from one, and a moderator opens an accusation with
-- nothing attached to judge. On an app with a duty of care, "send it, get
-- reported, delete it" must not be a way out.
--
-- ── and the content leaves the row rather than being hidden in it ───────────
--
-- The alternative was a `visible_messages` view nulling the body for
-- participants while the column kept it. Rejected on blast radius: it needs
-- `select` on `messages` revoked from `authenticated` or the raw row is still
-- one PostgREST call away, and `mark_chat_read` — SECURITY INVOKER, reading
-- messages for its own conditional — would have broken silently along with
-- anything else invoker-side that touches this table.
--
-- Moving the content out is a stronger guarantee anyway: not "a view hides it"
-- but "it is not in the row". What a member can reach cannot contain it,
-- whatever they query.

alter table public.messages
  add column if not exists deleted_at timestamptz;

comment on column public.messages.deleted_at is
  'Unsent by its sender. The row survives so reports keep their subject; the content moved to message_redactions.';

-- A redacted row legitimately has no content, and the constraint predates the
-- idea. Rewritten rather than dropped: an ordinary message must still carry one
-- of the three, or an empty send becomes possible.
alter table public.messages drop constraint if exists messages_has_content;
alter table public.messages add constraint messages_has_content check (
  deleted_at is not null
  or (body is not null and char_length(body) between 1 and 4000)
  or voice_note_path is not null
  or image_path is not null
);

/**
 * Where the content goes, and who can read it: nobody.
 *
 * The second table in this schema granted to no role at all — `waitlist` is the
 * other, for the same reason. No policies, no grants, RLS forced. Only SECURITY
 * DEFINER functions and the service client can see it, which is precisely the
 * moderation path (`admin_reports` is definer) and nothing else.
 *
 * A policy would be the wrong instinct here. There is no member who should read
 * this table: not the sender, who chose to withdraw it, and not the recipient,
 * for whom the whole point is that it is gone.
 */
create table if not exists public.message_redactions (
  message_id uuid primary key references public.messages (id) on delete cascade,
  chat_id uuid not null references public.chats (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text,
  image_path text,
  voice_note_path text,
  voice_note_seconds smallint,
  redacted_at timestamptz not null default now()
);

alter table public.message_redactions enable row level security;
alter table public.message_redactions force row level security;

-- Supabase grants every role everything on a new table in `public`, and
-- 20260813000700's opening revoke only covered what existed in August. Every
-- table created since has to revoke for itself; check:db enforces it for both
-- roles.
revoke all on public.message_redactions from anon, authenticated;

create index if not exists message_redactions_chat_ix
  on public.message_redactions (chat_id, redacted_at desc);

/**
 * Unsend one of your own messages.
 *
 * DEFINER because it writes `message_redactions`, which is granted to nobody —
 * and because the member must not be able to reach that table by any other
 * route. The authorisation is done here, explicitly, rather than inherited:
 *
 *   - the caller must be the SENDER. Not a participant: the other person
 *     withdrawing your words is a different feature and not one anybody asked
 *     for.
 *   - the chat must still be live. After the fuse or a closure note the
 *     conversation is a record of something that ended, and §3.5 gives the
 *     closure note as the last word — editing what it was a response to,
 *     afterwards, changes a record rather than a conversation.
 *   - already-unsent is a no-op rather than an error, because the button can be
 *     pressed twice on a slow connection and the second press is not a mistake
 *     worth a message.
 *
 * NO TIME WINDOW, deliberately. The mistakes this exists for — the wrong photo,
 * a phone number, something disclosed in the wrong chat — are frequently
 * noticed hours later, and a fifteen-minute window fails exactly the case the
 * feature is for. The chat's own seven-day fuse is the bound.
 */
create or replace function public.unsend_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := (select auth.uid());
  v_msg public.messages%rowtype;
  v_status text;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into v_msg from public.messages where id = p_message_id;

  -- Not found and not yours are the SAME answer, so this cannot be used to
  -- discover whether a message id exists.
  if v_msg.id is null or v_msg.sender_id <> v_uid then
    raise exception 'that message is not yours to unsend' using errcode = '42501';
  end if;

  if v_msg.deleted_at is not null then
    return;
  end if;

  select status into v_status from public.chats where id = v_msg.chat_id;
  if v_status is distinct from 'open' and v_status is distinct from 'date_planned' then
    raise exception 'this conversation has ended' using errcode = '42501';
  end if;

  insert into public.message_redactions
    (message_id, chat_id, sender_id, body, image_path, voice_note_path, voice_note_seconds)
  values
    (v_msg.id, v_msg.chat_id, v_msg.sender_id, v_msg.body, v_msg.image_path,
     v_msg.voice_note_path, v_msg.voice_note_seconds)
  on conflict (message_id) do nothing;

  -- deleted_at first in the statement so the relaxed constraint is satisfied by
  -- the same row version that empties the content.
  update public.messages
     set deleted_at = now(),
         body = null,
         image_path = null,
         voice_note_path = null,
         voice_note_seconds = null
   where id = p_message_id;
end;
$$;

revoke all on function public.unsend_message(uuid) from public, anon;
grant execute on function public.unsend_message(uuid) to authenticated;
