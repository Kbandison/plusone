-- The liveness retry cap lived in the browser.
--
-- §2 Decision #21 allows three attempts before a human sees the member. The
-- count was kept in `useActionState`'s client state and handed back to the
-- server action as `previous.attemptsLeft`, which the action trusted:
--
--   livenessAttempts: VERIFICATION.livenessMaxRetries - previous.attemptsLeft
--
-- React sends that state with the action call and nothing signs it. A crafted
-- request sets it to whatever it likes, and three things follow: the member
-- gets unlimited attempts at the check the whole product rests on, the
-- 'flagged' path that puts a human in the loop never triggers for anyone who
-- bothers to tamper, and — once a real provider is wired up — every retry is a
-- paid Face Liveness call with no ceiling.
--
-- So the count moves to the row. It is deliberately NOT added to the members'
-- column-level update grant (20260815000800), which is what makes it a wall
-- rather than a suggestion: `authenticated` has no table-level UPDATE on
-- profiles, so a column it is not explicitly granted is one it cannot write.
alter table public.profiles
  add column if not exists liveness_attempts int not null default 0;

comment on column public.profiles.liveness_attempts is
  'Liveness attempts consumed (Decision #21, cap VERIFICATION.livenessMaxRetries). '
  'Written only by the service client from the verification reducer. Never in the '
  'members'' update grant — the member being checked does not count their own tries.';

alter table public.profiles
  add constraint profiles_liveness_attempts_non_negative
  check (liveness_attempts >= 0);
