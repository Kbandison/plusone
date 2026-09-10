-- Contact details in the roster: shown as a shape, revealed one at a time.
--
-- Kevin asked for email and phone on 2026-09-09, having used the roster to find
-- an account he could not place. That is the roster's job and it could not
-- finish it: a display name identifies a member you already know and says
-- nothing about one you do not.
--
-- ── masked in the list, whole on request, and the reason is not compliance ──
--
-- The admin is already gated by is_admin(), so this is not access control —
-- every value here is one click away and meant to be. It is about what is on
-- screen WITHOUT anyone asking.
--
-- An admin screen gets photographed. Six real waitlist addresses were captured
-- off /admin/waitlist during this very session, by a screenshot taken to check
-- something else entirely, and that is the cheapest possible demonstration of
-- the difference between "an admin may see this" and "this is on screen by
-- default". The masked form — kb***@gmail.com, ***0147 — is enough to recognise
-- an account you own, which is what the request was actually for, and a
-- screenshot of it discloses nothing.
--
-- NO WRITTEN REASON, unlike admin_reveal_condition. §7.3 makes a diagnosis cost
-- a sentence because a diagnosis is the disclosure this app exists to protect.
-- A phone number is not that, and pricing them the same would either cheapen
-- the condition gate or make ordinary administration tedious enough to route
-- around. One button.

-- DROPPED FIRST, not replaced. `create or replace` cannot change a function's
-- return type, and this adds two columns to the returns-table — Postgres refuses
-- with "cannot change return type of existing function" and the whole migration
-- rolls back. `check:sql` passes it either way: the statement is perfectly legal
-- grammar and only execution knows. The dry run is what found it, which is the
-- second time that has been true this week.
drop function if exists public.admin_member_roster();

create function public.admin_member_roster()
returns table (
  user_id uuid,
  display_name text,
  verification_status public.verification_status,
  created_at timestamptz,
  last_active_at timestamptz,
  joined_in_beta boolean,
  open_reports bigint,
  email_masked text,
  phone_masked text
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
      where m.subject_user_id = p.id and m.status = 'open'),
    -- Masked HERE rather than in the component. A page that ships whole
    -- addresses and hides them with CSS has still put them in the payload, and
    -- §9.6 wants opaque ids in anything that might be logged or cached.
    case when u.email is null then null
         else left(split_part(u.email, '@', 1), 2) || '***@' || split_part(u.email, '@', 2)
    end,
    case when u.phone is null then null else '***' || right(u.phone, 4) end
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_admin()
  order by p.created_at desc
  limit 200;
$$;

revoke all on function public.admin_member_roster() from public, anon;
grant execute on function public.admin_member_roster() to authenticated;

comment on function public.admin_member_roster() is
  'Admin: who has signed up and when. Contact details are MASKED — admin_member_contact returns one whole. Still no condition: RevealCondition remains the only route to a diagnosis. Capped at 200 newest, no offset.';

-- One member, whole, on request.
--
-- Takes an id rather than a query, so it can only ever answer about somebody
-- already on screen. There is no way to sweep the table with it.
create or replace function public.admin_member_contact(p_user_id uuid)
returns table (email text, phone text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.email::text, u.phone::text
    from auth.users u
   where public.is_admin()
     and u.id = p_user_id
   limit 1;
$$;

revoke all on function public.admin_member_contact(uuid) from public, anon;
grant execute on function public.admin_member_contact(uuid) to authenticated;

comment on function public.admin_member_contact(uuid) is
  'Admin: one member''s email and phone, by id. No written reason, unlike admin_reveal_condition — a contact detail is not a diagnosis. Takes an id so it cannot sweep the table.';
