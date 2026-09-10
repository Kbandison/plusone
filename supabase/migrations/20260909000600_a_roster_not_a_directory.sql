-- A member listing for the admin, and what it deliberately leaves out.
--
-- ── this reverses half of a written decision, on purpose ────────────────────
--
-- `admin_member_lookup` (20260815000500) is search-only, and its comment gives
-- the reason: "Anything more is a directory of members' private details with a
-- search box on it." `admin/members/page.tsx` says the same in more words.
--
-- Kevin asked for the listing on 2026-09-09, having found he could not answer
-- "who has signed up" without already knowing a name to search for. That is a
-- real operational gap and the aggregate counts in `admin_metrics` cannot close
-- it: they say eight, not which eight.
--
-- So the listing is built, and THE OBJECTION IS ANSWERED RATHER THAN OVERRULED.
-- The words that matter in it are "private details". This returns who and when
-- and nothing else:
--
--   returned      display_name, created_at, verification_status,
--                 last_active_at, joined_in_beta, open_reports
--   NOT returned  condition, condition_detail, community, u_equals_u  — the
--                 diagnosis, which is the disclosure this whole app exists to
--                 make optional. RevealCondition is still the only route to it
--                 and it still costs a written reason.
--   NOT returned  email, phone, location, bio, prompts, photos — contact
--                 details and content. A moderator following a report reaches
--                 those through the report, not through a list.
--
-- Kevin's words, and they are the specification: "I want the full listing, but
-- i don't need their condition, just enough to see who and when."
--
-- ── the cap is not pagination ──────────────────────────────────────────────
--
-- 200, newest first, and no offset parameter. A listing you can page through
-- indefinitely is the directory the original decision refused; a first screen
-- of the most recent members is the operational view that was actually missing.
-- If this app ever has more members than fit here, the thing to build is a
-- filter — by status, by joined-in-beta, by inactive — not a page 2.

create or replace function public.admin_member_roster()
returns table (
  user_id uuid,
  display_name text,
  verification_status public.verification_status,
  created_at timestamptz,
  last_active_at timestamptz,
  joined_in_beta boolean,
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
    p.last_active_at,
    p.joined_in_beta,
    (select count(*) from public.moderation_queue m
      where m.subject_user_id = p.id and m.status = 'open')
  from public.profiles p
  -- Returns nothing to a non-admin rather than raising. This is a list, and an
  -- empty one is the correct answer for somebody who may not have it — the same
  -- shape as admin_news_rooms.
  where public.is_admin()
  order by p.created_at desc
  limit 200;
$$;

revoke all on function public.admin_member_roster() from public, anon;
grant execute on function public.admin_member_roster() to authenticated;

comment on function public.admin_member_roster() is
  'Admin: who has signed up and when. Returns no condition, no contact details and no content — RevealCondition remains the only route to a diagnosis. Capped at 200 newest, with no offset: a first screen, not a directory to page through.';
