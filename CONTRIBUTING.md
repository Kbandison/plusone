# Contributing

What actually happens on this repo, rather than what a template suggests. The
file this replaces described branches, pull requests, squash merges, CODEOWNERS,
`CHANGELOG.md`, Python and Go — none of which exist here, and following any of
it would have been wrong.

## How work lands

- **Straight to `main`.** No branches, no pull requests, no squash merges. Push
  every commit; nothing sits locally.
- **Five gates before every commit**, all of them, every time:

  ```bash
  pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  ```

  CI runs the same five and gates on all of them. Do not chain a commit after
  the checks in one shell line without gating on the result — a `FAIL` scrolls
  past and the push goes out anyway.

- **Never commit** `yourplusone-spec.md`, `luxweb-master/`, or any `.env*` but
  `.env.example`. They are gitignored and they stay that way.

## Commits

Conventional Commits for the subject: `type(scope): summary`, lowercase, no full
stop.

The body is the point. Say what was wrong, what it cost a member, and why the
fix is shaped the way it is. Somebody reading it in six months should not have
to reconstruct the reasoning from the diff — most of the hard decisions in this
codebase are only recorded in a commit body or a comment.

State which shells a change was verified against, and say plainly when one was
not. See `AGENTS.md`.

## The record

`PROJECT_UPDATES.md` is the running narrative — newest first, one entry per
theme, dated. Add one for anything that changes how the product behaves or why.

It is a **dated log**. Do not edit old entries to reflect new truth; a later
entry supersedes an earlier one. An entry that gets rewritten backwards stops
being a record.

Values Kevin has deferred go in an entry's "Held for Kevin" section. Never
invent one to unblock yourself.

`HANDOFF.md` is the other half, and it is not a record — it is a whiteboard.
Two sessions work on this repo from two machines, and it carries what a push
cannot: what is installed or broken on each, where the last session stopped, and
the dead ends already paid for. Rewrite your own block; keep the last three.

The line between them is what the reader needs it for. A product decision, or
the reasoning behind a change, is a dated entry in `PROJECT_UPDATES.md` and
stays there forever. "Node drifts off 22 whenever brew touches mongosh" helps
nobody in six months and is wrong the day it is fixed — that is `HANDOFF.md`,
and it should be deleted the moment it stops being true.

## Tests

Vitest, colocated as `*.test.ts` beside the code. There is no `tests/`
directory.

- `packages/logic` must stay green independently of any surface that consumes it
  (§12). It is pure — no clock, no network, no database — and that is what makes
  the mechanics testable at all.
- **Source-reading tests are deliberate here.** Several assert on the text of a
  file to pin a decision with no runtime surface. When you move the code they
  pin, repin them and say in the comment why the shape changed.
- No coverage target. Nothing measures it, and a number would not mean much
  against a suite that is mostly about behaviour nobody can see.

## Migrations and the database

- `pnpm check:sql` parses every migration against the real PostgreSQL grammar
  and cross-checks that every FK, function call, policy target and grant
  resolves. It needs no database. Run it.
- Every table needs RLS and at least one policy; `check:sql` enforces it.
- **Every table also needs a privacy classification.** The App Store and Play
  labels are a public legal statement re-affirmed months apart, and the way they
  go stale is not a bug — it is a feature landing and nobody thinking to revisit
  a form on Apple's website. `privacy-labels.test.ts` reads the migrations and
  fails until a new table, or a new `profiles` column, is classified in
  `packages/config/src/privacy-labels.ts`. "Carries nothing a label covers" is a
  valid answer; leaving it undecided is not.
- Mechanic transitions go through `SECURITY DEFINER` RPCs, never a direct table
  write (§5.3.4).
- A tunable is only reachable by the admin editor if its key already exists in
  `app_config`, so a new one has to be seeded by migration. The compiled value
  in `packages/config` stays the fallback: deleting a row must not change
  behaviour.
- The other `check:*` scripts exercise the real RPCs against a live database as
  real members. They skip without `SUPABASE_DB_URL`.

## Style

Prettier and ESLint decide; do not fight them.

- **No component library.** The design system is `@plusone/ui-tokens` — colour,
  type scale and spacing come from there, and `tokens.test.ts` recomputes the
  contrast ratios rather than trusting a comment.
- Server Components by default. `'use client'` only where something is actually
  interactive.
- Comment the _why_, at length where the reasoning is not obvious. This codebase
  is unusually heavily commented on purpose: the constraints are mostly
  invisible in the code, and a future reader who cannot see them will remove
  the thing that satisfies one.

## Secrets and discretion

- `.env.example` documents every key. `vercel env pull .env.local` fills them.
- Nothing that could identify a member's condition, message bodies or profile
  fields goes into a log or the audit trail (§9.6). Notifications are
  content-blind by construction, and the tests that enforce that are not
  optional.

---

`CONVENTIONS.md` covers the other half: how code here is written — the layout,
what `packages/logic` may not import, where behaviour belongs, and why the
comments are as long as they are.
