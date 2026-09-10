-- Faith and politics get their own consent, and the database is what holds it.
--
-- ── what this changes, and what it is upgrading ────────────────────────────
--
-- `draft-copy.ts` already found this gap and mitigated it with a sentence:
--
--   "these are the only fields on this form that are special category data a
--    member types in themselves. Every other Article 9 field on this profile
--    sits behind the consent screen and the community wall; these do not, and a
--    member should know that before answering rather than after."
--
-- That is NOTICE. It tells a member what will happen. It is not consent, and
-- religion and political opinion are named categories under GDPR Article 9 in
-- their own right — not merely by inference from what this app is. So the
-- weaker choice is replaced with the mechanism the health fields already use:
-- a `consents` row carrying the exact wording version the member agreed to.
--
-- Held as Q3 for counsel in the 2026-09-10 brief and resolved in the
-- conservative direction with Kevin's agreement. If counsel says a separate
-- consent is unnecessary, removing a screen is easy; adding one after members
-- have already answered is not.
--
-- ── the gate is a trigger, because of how profiles is granted ──────────────
--
-- `authenticated` holds INSERT and UPDATE on `religion` and `politics` —
-- read off information_schema.column_privileges, not inferred. So a member can
-- PATCH either straight through PostgREST and a check in a server action is
-- decoration: the action is not the only writer. Same finding, same fix, as the
-- per-photo privacy gate in 20260829000400.
--
-- ── two things it deliberately does NOT gate ───────────────────────────────
--
-- CLEARING is never gated. A member must always be able to withdraw an answer,
-- and a consent that cannot be walked back is not one. Setting either column
-- back to null needs nothing.
--
-- `prefer_not_to_say` is never gated either, and that is the more interesting
-- one. It is a real stored answer rather than a blank — the copy says so — but
-- it discloses no belief. Requiring consent to record that somebody declined to
-- answer would make the refusal cost more than the disclosure, which is exactly
-- backwards.

alter type public.consent_kind add value if not exists 'beliefs';

create or replace function public.profiles_beliefs_need_consent()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_disclosing boolean;
begin
  -- Is this write SETTING a belief to something that says one?
  if tg_op = 'INSERT' then
    v_disclosing :=
      (new.religion is not null and new.religion <> 'prefer_not_to_say')
      or (new.politics is not null and new.politics <> 'prefer_not_to_say');
  else
    v_disclosing :=
      (new.religion is not null and new.religion <> 'prefer_not_to_say'
        and new.religion is distinct from old.religion)
      or (new.politics is not null and new.politics <> 'prefer_not_to_say'
        and new.politics is distinct from old.politics);
  end if;

  if not v_disclosing then
    return new;
  end if;

  -- `kind::text` rather than a cast to the enum. `beliefs` is added by this same
  -- migration, and Postgres will not let a value added in the current
  -- transaction be USED in it — a literal cast here would fail on the very apply
  -- that creates it. Comparing as text sidesteps that entirely and costs
  -- nothing, since kind is already indexed with user_id.
  if not exists (
    select 1 from public.consents c
     where c.user_id = new.id
       and c.kind::text = 'beliefs'
  ) then
    raise exception 'faith and politics need their own consent first'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_beliefs_consent on public.profiles;
create trigger profiles_beliefs_consent
  before insert or update of religion, politics on public.profiles
  for each row execute function public.profiles_beliefs_need_consent();

comment on function public.profiles_beliefs_need_consent() is
  'Refuses a disclosing religion or politics answer without a beliefs consent row. Clearing and prefer_not_to_say are never gated: withdrawal must always be possible, and declining to answer must not cost more than answering.';
