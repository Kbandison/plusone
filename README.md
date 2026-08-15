# Plus One

A private, verified community for people with HSV and HIV.

> Dating with the talk already handled. Real people, real privacy, nobody gets ghosted.

Governed by the build specification (`yourplusone-spec.md`) and the LuxWeb design
system (`luxweb-master/`). Both are kept **out of this repository** — ask Kevin for a
copy. Decisions in §2 are locked. All user-facing copy is finalised in §3 and §9 and
lives in `packages/config` — never invent a string in a component.

## Layout

```
apps/
  web/            Next.js 16 App Router — marketing + member PWA
packages/
  config/         brand, verbatim copy, pricing, mechanic thresholds, env schema
  types/          domain types mirroring the SQL enums
  db/             Supabase clients (browser / server / service)
  logic/          PURE business logic — every mechanic, unit-tested, zero UI
  ui-tokens/      Linen (light) + Dusk (dark) design tokens
supabase/
  migrations/     schema, walls, RLS, views, RPCs
scripts/
  check-migrations.mjs   parses + cross-checks migrations without a database
```

**The critical rule:** every mechanic lives in `packages/logic` as pure functions with
unit tests, and every wall is enforced in RLS or an RPC. No mechanic logic in a
component, ever — a client bug must not be able to open a wall.

## Quickstart

```bash
pnpm install
cp .env.example .env.local   # fill in from the Vercel dashboard
pnpm dev
```

## Common tasks

| Command | What it does |
|---|---|
| `pnpm dev` | Run the web app |
| `pnpm typecheck` | Typecheck every package |
| `pnpm test` | Run all unit tests |
| `pnpm check:sql` | Parse + cross-check every migration (no database needed) |
| `pnpm check:db` | Verify the **applied** schema against a live database (needs `SUPABASE_DB_URL`; skips without it) |
| `pnpm check:admin` | Exercise the admin RPCs as a real admin and a real member, in a rolled-back transaction |
| `pnpm check:moderation` | Open a real report as a moderator, decide it, and confirm no condition data is exposed |
| `pnpm check:sweeps` | Expire a real fuse and assert it closes **with a note**; verify hard delete cascades |
| `pnpm check:walls` | Act as real members across every wall, and attempt every third-party probe |
| `pnpm check:referrals` | Attribute, convert and pay a real referral; confirm the job is idempotent |
| `pnpm check:safety` | File a real report and confirm it reaches a moderator; block and confirm it is mutual |
| `pnpm check:photos` | Confirm a blurred-until-connected member's clear path never reaches a viewer |
| `pnpm lint` | ESLint — **blocked on TypeScript 7**, see PROJECT_UPDATES.md |
| `pnpm build` | Production build |

## Design direction

Luxury Minimal × Soft Consumer — structure from the first (space, hierarchy, one
accent, no decoration), temperature from the second (warm neutrals, gentle easing,
humane radii). **Linen** is the light theme, **Dusk** is the dark one; the type
system does not fork by theme.

Instrument Serif (display) + Satoshi (body). Dials: VARIANCE 5 / MOTION 6 / DENSITY 3.

Every palette value is verified against WCAG 2.2 AA by recomputation in
`packages/ui-tokens/src/tokens.test.ts` — the contrast numbers are measured, not
asserted in a comment.

## Milestones

| # | Milestone | Status |
|---|---|---|
| 1 | Foundation — monorepo, config/types/db/ui-tokens, schema + RLS + RPCs, CI | done |
| 2 | Identity — phone OTP, liveness, verification pipeline, consent screen | done |
| 3 | Mechanics core — drop, connects, modes, referrals, tone | logic done |
| 4 | Member app α | |
| 5 | Community — rooms, preview drop, mode toggle | |
| 6 | Money + growth — Stripe, premium gates, referrals | referrals done |
| 7 | Admin + notifications + cron | sweeps + cron done |
| 8 | Polish + launch | |

Never cut, whatever the timeline: verification, RLS and the walls, fuse + closure,
content-blind notifications, hard delete, the consent screen, and chat voice notes.
