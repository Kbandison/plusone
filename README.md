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

Node >= 20.9 and pnpm 10.30.3 — `corepack enable` fetches the pinned version.

```bash
pnpm install
vercel env pull .env.local   # or: cp .env.example .env.local and fill it in
pnpm dev
```

Three things are deliberately absent from git and have to be carried across by
hand when setting up another machine: `.env.local` (or re-pull it as above),
`yourplusone-spec.md`, and `luxweb-master/`.

### On a Mac

Everything above runs unchanged. Nothing in the source assumes a platform, and
the two native modules — `sharp` and `libpg-query` — both ship arm64 binaries.

A Mac also provides the three things Linux cannot, all of which this project
currently needs:

- **Xcode**, without which the iOS Capacitor build cannot be produced at all.
- **The iOS Simulator**, which runs real WebKit with real notch and
  home-indicator insets. It is the only way to check `viewport-fit: cover`
  without owning an iPhone.
- **Safari and its Web Inspector**, which can attach to a physical iPhone or
  iPad over USB — the only way to see what a home-screen install is actually
  doing.

The Simulator has no usable camera, so `getUserMedia` — the liveness step and
the voice recorder — still needs a physical device.

## Common tasks

| Command                 | What it does                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm dev`              | Run the web app                                                                                   |
| `pnpm typecheck`        | Typecheck every package                                                                           |
| `pnpm test`             | Run all unit tests                                                                                |
| `pnpm check:sql`        | Parse + cross-check every migration (no database needed)                                          |
| `pnpm check:db`         | Verify the **applied** schema against a live database (needs `SUPABASE_DB_URL`; skips without it) |
| `pnpm check:admin`      | Exercise the admin RPCs as a real admin and a real member, in a rolled-back transaction           |
| `pnpm check:moderation` | Open a real report as a moderator, decide it, and confirm no condition data is exposed            |
| `pnpm check:sweeps`     | Expire a real fuse and assert it closes **with a note**; verify hard delete cascades              |
| `pnpm check:walls`      | Act as real members across every wall, and attempt every third-party probe                        |
| `pnpm check:referrals`  | Attribute, convert and pay a real referral; confirm the job is idempotent                         |
| `pnpm check:safety`     | File a real report and confirm it reaches a moderator; block and confirm it is mutual             |
| `pnpm check:photos`     | Confirm a blurred-until-connected member's clear path never reaches a viewer                      |
| `pnpm check:premium`    | Put a paying member and a free one against the real walls, and confirm money changed nothing      |
| `pnpm check:config`     | Change a tunable and confirm it is hot-read, audited, and that no key can be invented             |
| `pnpm lint`             | ESLint — works again; see the TypeScript pin in `package.json` for why it once did not            |
| `pnpm build`            | Production build                                                                                  |

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

| #   | Milestone                                                                 | Status                |
| --- | ------------------------------------------------------------------------- | --------------------- |
| 1   | Foundation — monorepo, config/types/db/ui-tokens, schema + RLS + RPCs, CI | done                  |
| 2   | Identity — phone OTP, liveness, verification pipeline, consent screen     | done                  |
| 3   | Mechanics core — drop, connects, modes, referrals, tone                   | logic done            |
| 4   | Member app α                                                              |                       |
| 5   | Community — rooms, preview drop, mode toggle                              |                       |
| 6   | Money + growth — Stripe, premium gates, referrals                         | done (keys pending)   |
| 7   | Admin + notifications + cron                                              | done (Resend pending) |
| 8   | Polish + launch                                                           | marketing site done   |

Never cut, whatever the timeline: verification, RLS and the walls, fuse + closure,
content-blind notifications, hard delete, the consent screen, and chat voice notes.
