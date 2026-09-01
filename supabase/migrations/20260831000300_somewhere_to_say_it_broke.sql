-- Somewhere to say it broke, or that it should do something else.
--
-- Kevin's ask 2026-08-31, alongside the closed beta: testers need a way to
-- report issues and request features. There was nowhere at all — the only
-- member-facing "report" in this app is `reports`, which is MODERATION, about a
-- person, and routes to a moderator queue. Sending a bug there would put "the
-- photo grid scrolls wrong" in front of somebody reviewing abuse.
--
-- ── kept deliberately separate from reports, and not merged later ───────────
--
-- The two look similar and are not. A moderation report is an accusation about
-- somebody else, is read under a duty of care, and its subject must never learn
-- who filed it. Feedback is about the software, is attributed on purpose so we
-- can reply, and has no subject to protect. One table would mean one queue, one
-- set of policies, and a permission shape that has to satisfy both — which in
-- practice means the weaker of the two.

create type public.feedback_kind as enum ('bug', 'idea', 'other');

-- 'declined' is a real outcome and saying so is the point. A tracker whose only
-- terminal state is 'done' either lies or grows a backlog nobody closes.
create type public.feedback_status as enum ('new', 'seen', 'done', 'declined');

create table public.feedback (
  id uuid primary key default extensions.gen_random_uuid(),

  -- Cascades, like everything else keyed on a member. A deleted account takes
  -- its feedback with it, which loses us a bug report and is nevertheless
  -- correct: §9.3 promises a hard delete and does not carve out the rows that
  -- happen to be useful to us.
  user_id uuid not null references public.profiles (id) on delete cascade,

  kind public.feedback_kind not null,
  body text not null,

  -- ── the context, which is the part testers never include ──────────────────
  --
  -- Which shell, which screen, which build. A bug report without them costs a
  -- round trip every time, and nobody thinks to add them.
  --
  -- `surface` matters more here than anywhere else in this app: AGENTS.md's
  -- standing rule is that a fix verified in one engine is not verified in the
  -- other, and a bug report that does not say which engine saw it cannot be
  -- acted on without asking.
  surface text,

  -- The route SHAPE, never the path.
  --
  -- `/app/chats/3f2a…` identifies a conversation, and a conversation on this
  -- app is two people and a diagnosis. `/app/chats/[id]` says exactly as much
  -- about where the bug is and nothing about who was in it. The stripping is in
  -- lib/feedback.ts and pinned by a test that plants a uuid.
  page text,

  app_version text,

  status public.feedback_status not null default 'new',

  -- Ours, not theirs. Never granted to `authenticated` in any form — see below.
  admin_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint feedback_body_len check (char_length(body) between 1 and 2000),
  constraint feedback_admin_note_len check (admin_note is null or char_length(admin_note) <= 2000),
  constraint feedback_surface_known
    check (surface is null or surface in ('browser', 'twa', 'ios', 'android')),
  -- A shape, not a path. Refuses anything with a query string or a fragment,
  -- which is where an id most often smuggles itself in.
  constraint feedback_page_shape
    check (page is null or (page ~ '^/[A-Za-z0-9/_.\[\]-]*$' and char_length(page) <= 120))
);

create index feedback_status_ix on public.feedback (status, created_at desc);
create index feedback_user_ix on public.feedback (user_id, created_at desc);

comment on table public.feedback is
  'Bug reports and feature requests from members. NOT moderation - see public.reports for that, and the header of 20260831000300 for why they must stay apart.';

-- ── privileges ──────────────────────────────────────────────────────────────
--
-- The new-table rule from 20260826000200: Supabase grants everything on a new
-- table in `public` to anon and authenticated, so revoke first and grant back
-- only what is meant to be exposed.
revoke all on public.feedback from anon, authenticated;

-- SELECT only, and no INSERT at all.
--
-- This is 18a's shape rather than 18b's, and the choice is forced by the same
-- question: can a member reach a column they should not set? `status` and
-- `admin_note` are on this table, so a whole-table insert grant would let
-- somebody file a report already marked `done`, or write the note a moderator
-- reads. Column-level insert grants would work and would need revisiting every
-- time a column is added.
--
-- So nothing is granted for writing and `submit_feedback` below is the only
-- writer. A member has no path to those columns rather than a path that is
-- checked.
grant select on public.feedback to authenticated;

alter table public.feedback enable row level security;

create policy "feedback is visible to the member who wrote it"
  on public.feedback for select
  to authenticated
  using ((select auth.uid()) = user_id or public.is_admin());

-- ── the only writer ─────────────────────────────────────────────────────────
create or replace function public.submit_feedback(
  p_kind public.feedback_kind,
  p_body text,
  p_surface text default null,
  p_page text default null,
  p_app_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid;
  v_recent integer;
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Trimmed here rather than trusted from the client, so the length constraint
  -- measures what is stored.
  p_body := btrim(coalesce(p_body, ''));
  if char_length(p_body) = 0 then
    raise exception 'feedback cannot be empty' using errcode = '22023';
  end if;

  -- A rate limit, because this is an unauthenticated-shaped write in every way
  -- except the session: no cost, no moderation, and a text column. Ten in an
  -- hour is far above any real use and far below a nuisance.
  select count(*) into v_recent
    from public.feedback
   where user_id = v_me and created_at > now() - interval '1 hour';

  if v_recent >= 10 then
    raise exception 'too many reports, try later' using errcode = '54000';
  end if;

  insert into public.feedback (user_id, kind, body, surface, page, app_version)
  values (v_me, p_kind, left(p_body, 2000), p_surface, p_page, p_app_version)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_feedback(public.feedback_kind, text, text, text, text)
  from public, anon;
grant execute on function public.submit_feedback(public.feedback_kind, text, text, text, text)
  to authenticated;

-- ── triage ──────────────────────────────────────────────────────────────────
create or replace function public.admin_set_feedback_status(
  p_id uuid,
  p_status public.feedback_status,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- The wall where the write is. The admin layout turns a non-admin away at the
  -- door and this refuses them at the table, because a layout guard stops a
  -- page rendering rather than a POST arriving.
  if not public.is_admin() then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  update public.feedback
     set status = p_status,
         admin_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), admin_note),
         updated_at = now()
   where id = p_id;

  return found;
end;
$$;

revoke all on function public.admin_set_feedback_status(uuid, public.feedback_status, text)
  from public, anon;
grant execute on function public.admin_set_feedback_status(uuid, public.feedback_status, text)
  to authenticated;
