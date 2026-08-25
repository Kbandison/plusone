# Engineering Conventions

How code in this repo is written. `CONTRIBUTING.md` covers how work _lands_ —
branches, gates, commits — and is not repeated here.

The file this replaces was scaffolding: it described a `src/` and `tests/`
layout, a Dockerfile, shadcn/ui, semantic-release tagging and testing
conventions for Python and Go. None of that exists here.

## Layout

```
apps/web            Next 16, App Router. The only application.
packages/config     Compiled defaults, copy, env schema, brand, legal.
packages/logic      The mechanics. Pure — see below.
packages/types      Shared types with no behaviour.
packages/db         Supabase client factories and the RPC name registry.
packages/ui-tokens  The design system: colour, type scale, spacing.
supabase/migrations Schema, RLS, policies, RPCs. Ordered by filename.
scripts             Operator tools. Not part of the build.
```

## `packages/logic` is pure

No clock, no network, no database, no environment. Time arrives as a parameter
(`now: number`), never as `Date.now()` inside a function. Randomness likewise.

This is what makes the mechanics testable at all, and it is why
`packages/logic` must stay green independently of any surface that consumes it
(§12). A rule that needs a database to prove is a rule nobody re-checks.

Each domain is a directory — `drop`, `fuse`, `connects`, `notify`, `quiz` — with
its types beside its functions and its tests beside both.

## Where behaviour lives

- **Server Components by default.** `'use client'` only where something is
  genuinely interactive, and as far down the tree as it will go.
- **Server Actions** for anything a member does. Route handlers are for things
  that are not a member: webhooks, cron.
- **Mechanic transitions go through `SECURITY DEFINER` RPCs** (§5.3.4), never a
  direct table write. The database is the last place a rule can be enforced, so
  it is where the rules that matter are enforced.
- **A pure decision belongs in `packages/logic`**, with the surface calling it.
  If a Server Action grows a branch that could be described without a database,
  that branch is in the wrong file.

## Configuration

Two layers, and they are not interchangeable.

`packages/config` compiles the defaults. `app_config` holds admin overrides that
`apps/web/src/lib/tunables.ts` hot-reads and merges. The compiled value is the
fallback: **deleting a config row must never change behaviour**.

A key is only reachable by the §7.3 editor if it already exists in `app_config`,
so a new tunable needs a seeding migration as well as a default. Unseeded, it
works correctly and silently and nobody can touch it.

## Design

There is no component library. `@plusone/ui-tokens` is the design system —
colour, type scale and spacing come from there, both themes are defined
together, and `tokens.test.ts` recomputes the WCAG ratios rather than trusting a
comment. Tailwind v4 consumes the tokens; it does not replace them.

Anything pinned to a viewport edge reads `env(safe-area-inset-*)`. `viewport-fit`
is `cover`, so those insets are real and ignoring one puts a control under a
gesture bar.

## Types

Strict TypeScript, no `any`, and no `as` that erases a real difference. Prefer a
type that makes the wrong state unrepresentable over a check that catches it.

`readonly` on anything shared across a boundary — `packages/logic` returns
`readonly` arrays because a caller mutating a result is a bug that surfaces
somewhere else entirely.

## Comments

Comment the **why**, at length where the reasoning is not obvious.

This codebase is unusually heavily commented and that is deliberate. Most of its
constraints are invisible in the code: §8's content-blindness, a §9.6 log that
must carry opaque ids only, a weight that must never loosen, a ref that must not
survive a discarded render. A future reader who cannot see the constraint will
remove the thing that satisfies it, and the comment is the only thing standing
between them and that.

Say what was wrong and what it cost, not what the code does. The code says what
it does.

## Discretion is a code concern

§8 is not a policy document that lives elsewhere — it constrains what functions
may return.

- `buildPayload` is the only way to make a notification payload, and it refuses
  a condition word. Providers re-check on the way out.
- Logs carry opaque ids and enums. Never message bodies, profile fields, or
  anything about a condition (§9.6).
- A count is a disclosure. So is a name in a subject line, an app-icon badge,
  and a store listing category.

When a change touches any of those, say so in the commit.

## Shells

Web, an Android TWA and an iOS Capacitor build. See `AGENTS.md` — the rule about
verifying against both engines is there because it is easy to skip.
