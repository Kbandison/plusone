# Project Updates

## 2026-08-14 — Policy corrections

**Messages are encrypted, and the draft only said they were not E2EE.** Decision
#29 carries both halves — "Encryption in transit + at rest + RLS + content-blind
notifications", with E2EE out because it breaks tone-check and moderation. Saying
only the second understates a real protection. In a privacy policy, omitting a
true safeguard distorts as much as claiming a false one.

The section now states the encryption, states that it is not end-to-end, and
gives the reason: a reported message has to be readable by a human, which is
impossible when we hold no key. The honest cost is stated too — compelled
disclosure is possible here in a way it is not on Signal.

The guard test was also wrong. §3.3 reads "never 'encrypted', 'anonymous' or
'guaranteed' **unless literally true**" — a rule about qualification, not
avoidance. It now allows a banned claim in a sentence that denies it or
qualifies it as in-transit/at-rest, and separately requires the messages section
to carry both facts plus the reason.

**The data-export promise is cut.** §9.4's JSON self-export is not built and is
**second in the §10 cut order**, so the policy was promising something that may
never ship. It comes back when the feature does. A test now fails if the word
returns to the policy first — a privacy policy is the one document that cannot
describe intentions.

**No contact address yet**, by Kevin's call: the domain is not secured. A test
asserts the policy contains no email address, so the gap stays visible instead of
being half-filled with something that does not resolve. This is a **launch
blocker** — the policy commits to rights that carry response clocks, and those
need somewhere to arrive.

## 2026-08-14 — Consent copy approved · privacy policy drafted

Kevin authorised writing the four consent-screen strings and drafting the privacy
policy, so both copy gaps from the previous entry are closed. The policy is a
**draft pending his review and counsel sign-off** (Decision #30).

### The checkbox label is now part of the versioned consent

`PENDING_COPY` is gone; the heading, checkbox label, button and link text moved
into `COPY.consent` as approved copy.

The digest widened while doing it. It now covers the §9.1 body **and the checkbox
label**, joined by a newline — the label is what a member actually ticks, so a
consent has to be bound to it. The heading and the button stay out: they are
chrome, not agreement. Changing either of the two that matter fails CI with the
correct replacement digest in the message.

### The privacy policy — `packages/config/src/legal.ts`, rendered at `/privacy`

Written against what the schema actually does rather than a template, so every
claim is checkable in `supabase/migrations`. Fourteen plain-language sections;
§9.1's consent screen deep-links to `#health-data`, and the anchor is a shared
constant so the link cannot drift from the section.

Points worth Kevin's eye:

- **It says messages are not end-to-end encrypted, in those words**, and that we
  could read them if compelled. §3.3 bans claiming "encrypted"; the honest move
  is not silence but the denial. A unit test enforces the rule as written:
  `encrypted`, `anonymous` and `guaranteed` may appear only in a sentence that
  also negates them.
- **It states plainly that our database never holds a legal name** — Stripe does,
  because a payment processor must.
- **It commits to the health-data standard globally**, naming WA My Health My
  Data and Nevada, matching §9.2's no-geofencing posture.
- **It describes the walls as enforced in the database, not the app**, which is
  true and is the strongest privacy claim the product can actually make.
- **Withdrawing health-data consent deletes the account.** Matching cannot run
  without it, and pretending otherwise would be the dishonest option.

Two things in it are assumptions, not facts, and need confirming: the data-export
promise (§9.4 lists it, and it is not built yet) and the appeal wording under
verification. There is also no contact address anywhere in the policy — that is a
real gap for a privacy policy and needs an inbox that exists.

Verified against the served HTML: all fourteen sections render, the consent
screen's link resolves to a real anchor, and every substantive claim above is
present in the output.

### Next

Profile basics and community + condition, then the `/onboarding` auth entry.

## 2026-08-14 — The §9.1 consent screen

**Decision confirmed:** consent gets its own screen with an unbundled checkbox,
per §9.1 rather than §7.2. The onboarding machine already enforced it; this
records the call.

### The screen

`/onboarding/consent`. The §9.1 paragraph renders verbatim and in full — it is
the consent, not a summary of one, so nothing is truncated behind a "read more".
The checkbox starts unticked, is the only thing on the screen, and carries a real
`<label>`. Verified against the served HTML rather than assumed.

The action treats itself as an untrusted entry point (as Next's own guidance
puts it) and re-checks the tick server-side: a consent recorded from a client's
assertion is not a consent. It runs as the member, so the RLS policy on
`consents` is what authorises the write. A duplicate submit hits the
`(user_id, kind, copy_version)` unique constraint and moves forward rather than
erroring — a double-tap is not a failure.

### Consent copy is versioned by content digest

`consents.copy_version` ties a member's tick to the exact wording they read.
`CONSENT_COPY_VERSION` records the version and `CONSENT_COPY_DIGEST` records a
SHA-256 prefix of the copy, checked by a unit test. **Editing the consent wording
without bumping the version now fails CI**, with the correct digest in the
failure message — otherwise old consents would silently stand in for new wording,
which is the one failure mode this column exists to prevent.

### Finding — member surfaces inherited the marketing description

The root layout sets `description` to the §3.1 marketing sub, which names both
conditions. Correct on a page whose job is to be found; wrong on a screen someone
is filling in.

Social cards were **not** affected — the root layout already points Open Graph at
the neutral §3.4 landing copy, deliberately, so link previews never leaked. The
gap was the plain `<meta name="description">` tag riding along onto member
surfaces, doing no work on a noindex page and carrying disclosure risk for no
benefit. Nulled in a new `/onboarding` layout, which covers every step including
the ones not written yet. Verified by diffing the served metadata of a marketing
page against a member page.

### Copy gaps — need Kevin

§9.1 gives the consent body verbatim but no heading, checkbox label, button or
link text, and a screen cannot be built without them. Per §12 copy is never
invented, so the four drafts live in `PENDING_COPY` in `packages/config` —
flagged in one place rather than scattered through components pretending to be
approved. The checkbox label is the one carrying legal weight: it has to state
what is being agreed to on its own, because that is what unbundled means.

`/privacy#health-data` is linked per §9.1 but **the route does not exist yet**.
The privacy policy body is not in the spec and is subject to counsel review
(Decision #30), so it is not something to draft here.

### Next

Profile basics and community + condition, then the auth entry at `/onboarding`
— which is also where the consent action currently redirects an unauthenticated
member, so that route landing is what makes the guard real rather than nominal.

## 2026-08-14 — Onboarding flow and the OTP seam

Twilio credentials are coming later, so the phone provider is stubbed. The phone
step itself stays **required** in the onboarding machine — only the provider is
swappable. Disabling the step to unblock development would have been the version
of this that quietly ships.

### Spec conflict — where the consent checkbox lives

§7.2 puts the health-data consent checkbox on the community + condition screen.
§9.1 requires it on its **own screen, unbundled**. Those cannot both hold: a
checkbox on the screen where a member is also choosing their condition is the
definition of bundled.

Built to §9.1, which is headed "build requirements, not aspirations" and matches
what WA My Health My Data actually requires of separate consent. **Flagged for
Kevin** — if §7.2 is the intended reading, this is one line in ONBOARDING_STEPS,
but the compliance-safe default is the one worth defaulting to.

### `packages/logic/onboarding` — 43 tests

The §7.2 order as a pure reducer: phone -> liveness -> profile basics ->
community + condition -> health consent -> intention -> quiz -> photos ->
radius -> done. Two structural guarantees:

- **The generic advance cannot pass the consent step.** `complete` fails on
  `health_consent`; only `grant_consent`, carrying the timestamp §9.1 says to
  store, moves a member past it. And it cannot be granted from any earlier step,
  which is the other half of unbundled. Bundled consent is not something this
  machine can express.
- **Only the quiz is skippable.** §7.2 marks it "skippable-but-nudged" and marks
  nothing else. `SKIPPABLE_STEPS` is the sole source of that, `skip` fails on
  every other step, and a test walks all of them to prove it.

### `packages/logic/verification/otp` — 28 tests

The seam around Supabase Auth's Twilio provider, plus a deterministic stub that
refuses to construct in production.

**The code is never handed back to the caller.** `OtpChallenge` has no field that
could carry it — asserted against both the source and the runtime object — because
a provider that returned the code would let a client verify itself, which is the
entire value of an out-of-band factor gone.

`normalizePhone` strips the punctuation people type but will not invent a country
code: guessing one silently sends a member's code to a stranger.

`OTP_PROVIDER` joins the env schema. Note it takes no credential — Twilio's live
in the Supabase dashboard, since Supabase Auth talks to Twilio on our behalf.

### Next

Surfaces: the §9.1 consent screen, profile basics, and community + condition,
built on Linen/Dusk with copy drawn from `packages/config`.

## 2026-08-14 — Supabase wired · TypeScript 7

**Supabase project is live and the schema is applied.** All 8 migrations pushed
clean on the first attempt against PostgreSQL 17.6 (`us-west-2`).

WSL2 has no IPv6 egress and Supabase's direct database host is IPv6-only, so this
went through the IPv4 session pooler. The pooler hostname is region-scoped and the
region is not discoverable from the project URL — every `*.pooler.supabase.com`
name resolves regardless of whether it hosts the project — so it was found by
probing with the real credentials and reading the tenant-lookup error.

The URL had been pasted from the "RESTful endpoint" field rather than the Project
URL, so it carried a `/rest/v1/` path and every request 404'd with *"Invalid path
specified in request URL"* — a long way from its cause. Corrected in `.env.local`,
and `clientEnvSchema` now rejects any Supabase/site/app URL carrying a path, query
or fragment so the same paste fails loudly at boot instead. A lone trailing slash
is normalised away rather than rejected: that one is a browser-bar artefact, not a
mistake, but it must not survive into string concatenation either.

**TypeScript 5.9.3 → 7.0.2.** Typecheck, tests and the production build are green.
Two things came out of it:

- **`@types/node` was never declared** by `config`, `logic` or `ui-tokens`, all of
  which import `node:fs` in their tests. TS 5.9 walked up to the workspace root and
  found it anyway; TS 7 does not, which surfaced 11 errors. Now declared where it is
  used, with `types: ["node"]` naming it explicitly.
- **ESLint is blocked upstream.** typescript-eslint throws on any TS >= 7 and no
  published version accepts it (support tracked at typescript-eslint#10940 for
  TS >= 7.1). There is no config workaround: `typescript` is a *peer* of
  typescript-eslint and `node-linker=hoisted` means exactly one copy exists in the
  tree, so neither `pnpm.overrides` nor `packageExtensions` can hand the linter its
  own TS 6 — both were tried and neither takes effect. The CI step is left in place
  and visibly failing (`continue-on-error`) rather than deleted, so it returns the
  moment upstream ships. TS 6.0.3 is published and stable if we would rather have a
  fully green toolchain than the Go port's speed.

### Bug found and fixed

- **The new URL refinement swallowed its own error message.** Zod runs refinements
  even after the base check has failed, so `new URL("nope")` threw a TypeError out
  of `safeParse` and replaced the whole formatted issue list with a bare
  `Invalid URL` — no key name, strictly worse than what it replaced. Caught by the
  test that asserts every offending key is named at once. The refinement now
  returns false instead of throwing.

### Applied-schema verification — `scripts/verify-schema.mjs`

`pnpm check:sql` parses the migrations; it cannot see what Postgres did with them.
The new `pnpm check:db` checks the properties that only exist once the SQL has run,
each of which fails silently rather than loudly when it is wrong:

- **`security_invoker` is on for all three views.** Confirmed `true`. Without it a
  view runs as its owner and quietly bypasses every policy underneath — it still
  returns rows, just the wrong ones to the wrong people.
- **All 25 SECURITY DEFINER functions pin `search_path`.** An unpinned one can be
  steered into calling an attacker's same-named function.
- **PostGIS resolves at call time.** `distance_mi(SF, LA)` returns 347 mi, so the
  `extensions.`-qualified references are right — unqualified ones parse fine and
  only fail when called.
- 24 tables / 3 views / 32 functions / 17 enums; RLS and >=1 policy on every table;
  no UPDATE policy on `connects` or `chats`; `anon` holds no table grants at all;
  5 seed rooms and 16 `app_config` rows.

Two failures on the first run were both wrong assertions in the checker, not schema
defects: `round_location` takes one `geography`, not two numerics, and the seed has
16 config rows, not the 17 I had noted. Corrected in the checker.

### Spec correction — §4.2 "Stripe Identity selfie-only mode" does not exist

Stripe Identity's selfie check is not standalone. Per Stripe's own docs it compares
the face against *a government-issued photo ID*, and it is enabled as
`options[document][require_matching_selfie]` on a `type=document` session. There is
no document-free mode. §4.2 names a product that is not offered.

That matters more here than it would elsewhere:

- It contradicts **Decision #6** ("no documents"). Requiring a driver's licence from
  every member of an HSV/HIV community is the largest possible trust ask, against an
  incumbent whose defining complaint is privacy.
- It contradicts **Decision #21's** two-minute target — document capture plus selfie
  is slower and abandons far harder than a selfie alone.
- Its `verified_outputs` returns first name, last name, address and date of birth —
  PII that §5.2 deliberately gives the schema nowhere to put.
- ~$1.50/verification against ~$0.015 for AWS Rekognition Face Liveness. Roughly
  100x, against a §4.2 line reading "pick cheapest adequate".

**AWS Rekognition Face Liveness** is the standing recommendation when the choice is
made: genuinely document-free, purpose-built, and it returns the confidence score
that §4.2 says to keep after purging the media. FaceTec is enterprise sales-led —
wrong scale for a 300-member v1.

**Decision: deferred.** The pipeline is built against the adapter seam with a stub.

### Verification pipeline — `packages/logic/verification`

The §4.2 machine as a pure reducer, 40 unit tests. Two structural guarantees, in the
same spirit as the fuse's missing `extend`:

- **No raw media can enter the state.** §4.2 says the selfie is purged at decision
  time and only a boolean and a score survive. `VerificationState` has no field that
  could hold a file id, and `LivenessOutcome` has exactly two — `passed` and `score`.
  Both are asserted against the source, so the purge cannot be forgotten: there is
  nowhere to keep the thing. This is also the seam that stops a chatty provider's
  extra PII at the boundary.
- **The appeal is never gated on the thing being appealed** (Decision #21). The
  `open_appeal` branch reads `status` and nothing else — not attempt count, not
  score. A member who never passed a check can still ask a human to look.

`rejected` is unreachable without an administrator; exhausted retries go to
`flagged`, which is a queue, not a verdict. An automated dead end with no way out is
the hostile verification Decision #21 is a reaction to. A test drives 200 mixed
events and asserts `rejected` never appears.

The stub is deterministic and **refuses to construct when NODE_ENV=production** — a
stub that always passes is precisely the fake-profile problem the pipeline exists to
prevent, so shipping one by accident has to be loud.

`LIVENESS_PROVIDER` accepts `stub` and defaults to it; `LIVENESS_API_KEY` is now
required for every provider *except* stub. The single-opaque-key shape will not
survive the real choice — AWS needs an access key id, secret and region, and Stripe
Identity has no key of its own — so it stays as-is rather than guessing a shape.

Mechanics are now namespaced in the `@plusone/logic` barrel (`fuse.transition`,
`verification.transition`). Six more state machines are coming and they all want to
call their reducer `transition`.

### AWAITING KEVIN — held placeholders

Deliberately held on 2026-08-14. Nothing below blocks Milestone 2 except where noted.
(The database password was supplied and the schema is applied — **rotate it**, it was
sent in chat. It is in no file in this repo; `pnpm check:db` reads `SUPABASE_DB_URL`
from the environment.)

| # | Held | Blocks |
|---|---|---|
| 1 | **Privacy contact address.** The policy commits to rights with response clocks and has no route for making a request. Waiting on the domain being secured; `privacy@yourplusone.app` is the intended alias. Note Resend only *sends* — receiving needs mail hosting or a forwarding rule. | **launch** |
| 2 | **Privacy policy review.** Drafted 2026-08-14, live at `/privacy`. Needs Kevin's read plus counsel sign-off (Decision #30). | launch |
| 3 | **Data export (§9.4).** Unbuilt, and second in the §10 cut order. The policy sentence is removed until it ships; a test keeps it out. | fast-follow |
| 4 | **Five room display titles.** §5.2 locks the slugs, not the titles. Slug-derived placeholders sit in `20260813000800_seed.sql`, flagged inline. Still the only user-facing strings in the build not taken from the spec verbatim. | Milestone 5 |
| 5 | **Stripe keys** — secret, webhook secret, and the three price IDs. | Milestone 6 |
| 6 | **Resend API key.** | Milestone 7 |
| 7 | **Liveness provider choice**, and its credential. Deferred 2026-08-14; running on `stub`. Recommendation is AWS Rekognition Face Liveness — see the spec correction above. | before launch |

### Next

Milestone 2 — Identity: phone OTP, the swappable liveness adapter, verification
pipeline plus admin flag queue, profile CRUD, and the §9.1 consent screen.

## 2026-08-13 — Milestone 1: Foundation

**Phase 2 gate closed.** Direction locked as Luxury Minimal × Soft Consumer:
structure from the first, temperature from the second. **Linen** (light) and **Dusk**
(dark) ship as one token system; the type system does not fork by theme.
Instrument Serif + Satoshi, both free to license. Dials V5 / M6 / D3.
Naming: "Plus One" in all user-facing copy — the two §3.4 strings that used the full
name were updated.

**Monorepo.** Flat Next.js app restructured to the §4.1 layout under Turborepo +
pnpm: `apps/web` plus `packages/{config,types,db,logic,ui-tokens}`. History preserved
via `git mv`. npm lockfile dropped in favour of pnpm.

**Schema.** 24 tables, 3 views, 32 functions, 17 enums across 8 migration files.
Default-deny RLS on every table. The community/mode/block/verified wall lives in one
function, `can_view_profile()`, used by both the `profiles` policy and the
`visible_profiles` view. `preview_profiles` redacts name and exact distance in SQL —
the Preview Drop is not a client-side blur. State transitions go through ten
SECURITY DEFINER RPCs; `connects` and `chats` have no update policy at all, which is
what makes "the fuse is never purchasable" structural rather than a promise.

**Mechanics.** `packages/logic/fuse` — the §6.2 state machine as a pure reducer,
48 unit tests. The `FuseEvent` union contains no extension path by design.

**Verification.** 117 unit tests pass. Typecheck, lint and production build pass.
Migrations are parsed against the real PostgreSQL grammar and cross-checked for
unresolved references, missing RLS, and granted-but-policyless tables via
`pnpm check:sql` (also wired into CI).

### Bugs found and fixed during the build

- **Connects RLS policy inverted its own wall.** The insert policy read
  `public.profiles` inline to test the dating→support-only case. That read is itself
  RLS-filtered, and since a dating-mode member cannot see a support-only profile, the
  `not exists (...)` was vacuously true — the wall passed in exactly the case it had
  to block. Now routed through a SECURITY DEFINER `profile_mode()`. The trigger had
  always caught this, so the defect was in the independent second layer, not the
  system's behaviour.
- **Dusk tertiary text failed AA on cards.** `#877A6E` was solved against the page
  ground but card surfaces are lighter on dark, where it measured 4.27:1. Moved to
  `#8D8074` (4.90 ground / 4.64 surface). The contrast suite now checks both grounds.
- **Clay accent failed AA as text.** `#B5674A` measured 3.67:1 on linen. Deepened to
  `#9F5B41` (4.53:1, and 4.90:1 carrying warm white).

### Open items

- **Supabase project provisioned 2026-08-14, schema still not applied.** The SQL has
  never reached a real Postgres, so runtime semantics — PostGIS schema
  qualification, `security_invoker` view behaviour, RLS interaction under load —
  remain unverified. Needs the database password.
- **Copy gap: room titles.** §5.2 locks the five room slugs but not their display
  titles. Placeholders are in the seed migration and flagged there. These are the only
  user-facing strings in the build that did not come from the spec verbatim.
- **`connect_budgets` shape deviates from §5.2.** Daily budget is a table; the
  support-only weekly budget is counted directly off `connects` rather than stored as
  a denormalised column, which cannot drift out of sync.
- ~~**TypeScript held at 5.9.3.**~~ Moved to 7.0.2 on 2026-08-14. The tooling
  concern was well founded — see that entry.

