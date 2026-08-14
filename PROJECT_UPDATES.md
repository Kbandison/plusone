# Project Updates

## 2026-08-14 — The probe leak is closed

Yesterday I documented a leak as an accepted cost: RLS helper predicates have to
stay callable by `authenticated`, and most took a viewer argument, so a member
could substitute any uuid and ask questions about other people. On a second look
that framing was wrong. The leak was not the grant — it was the **argument**.

Every one of those predicates was called with `auth.uid()` in practice. Taking
the parameter away makes the question unaskable rather than merely discouraged.

| Was askable about anyone | Now |
|---|---|
| `is_admin(uuid)` — who moderates | `is_admin()` — am I one |
| `is_premium(uuid)` — who pays | revoked; only a trigger calls it |
| `profile_mode(uuid)` — who is support-only | folded into `connect_permitted` |
| `is_blocked_either_way(a, b)` — have two others blocked | `preview_permitted(other)` |
| `has_accepted_connect(a, b)` — have two others connected | `i_have_connected_with(other)` |
| `is_member_of_room(user, room)` — is someone else in a room | `i_am_in_room(room)` |
| `is_chat_participant(chat, user)` | `i_am_in_chat(chat)` |
| `can_view_profile(viewer, …)` — what can someone else see | `i_can_view(target, …)` |
| `shares_room(a, b)` | dropped — nothing called it |

The connects policy now calls one compound predicate,
`connect_permitted(target, room)`, instead of three separately-askable facts. A
false does not say *which* wall stopped it, and the initiator is implicit, so it
can only be asked about the caller's own reach — which is what the connect
button already tells them.

The two-argument originals survive because SECURITY DEFINER functions call them
internally and run with their own rights. They are revoked from `anon` and
`authenticated`, so no session can reach them.

### The order mattered more than the change

This rewrote the walls. So `pnpm check:walls` was written **first**, against the
existing behaviour — 19 checks covering the community wall, the mode wall,
cross-community opt-in, verification, blocking, and the preview surface. It
passed before the refactor and passed unchanged after it, which is the only
reason to believe the rewrite was safe.

Nine probe attempts were then added to it, each asserting a question about a
third party is refused, plus four asserting the self-relative versions still
answer. One of those four failed at first and the test was wrong, not the code —
it expected `false` from `i_am_in_room` for a member who had joined that room
earlier in the same test. Asserting the real answer is the better test.

### What remains, honestly

A member can still ask "can I see X", "may I connect to X", "am I blocked with
X". Every one of those is answered by the interface anyway — a profile appears
or does not, a button works or does not. **No predicate answers a question about
two other people, and none reveals a fact with no counterpart in the UI.**

The one thing I would still call a residue: repeated `connect_permitted` calls
across many targets would let someone infer *something* about who is reachable.
It is a compound answer over four walls, so what leaks is mixed and weak, and it
is the same information as trying to connect and being refused.

### A process note

I appended the admin-RPC change to `20260814001000`, which had already been
applied — so it would never have run, and the file on disk would have described
a schema the database did not have, with nothing complaining. Split into
`20260814001100`. Editing an applied migration is silent in a way that matters.

## 2026-08-14 — The sweeps, and a security hole they uncovered

### SECURITY: every SECURITY DEFINER function was callable by anyone

Supabase sets default privileges granting `EXECUTE` on every new function in
`public` to `anon`, `authenticated` and `service_role`. `revoke all ... from
public` does **not** touch those — they are named grants, not the PUBLIC
pseudo-role. My grants file had a "deliberately NOT granted" comment describing
something that was never true.

All 33 definer functions were reachable by any signed-in member, and by anyone
at all. Most check their caller and were unharmed. Four did not:

| Function | What an arbitrary caller could do |
|---|---|
| `purge_due_deletions` | **Delete every account whose 7-day window had elapsed.** |
| `sweep_expired_fuses` | Close chats across the whole system. |
| `sweep_expired_connects` | Expire connects across the whole system. |
| `audit` | Write arbitrary audit entries. A forgeable log is worse than none — it still looks intact. |

Found by a check I wrote *while adding the sweeps*, asserting they were
service-role only. They were not, and neither was anything else.

Fixed in two layers, because the grant is what failed:

1. Revoked from `anon` and `authenticated` **by name**.
2. `assert_not_end_user()` inside each one — a cron call arrives with no
   `auth.uid()`, a member's call always has one. Verified by re-granting
   `purge_due_deletions` to `authenticated` and confirming it still refuses.

**What deliberately stays reachable**, now written down rather than assumed: the
RLS helper predicates — `can_view_profile`, `profile_mode`,
`is_blocked_either_way` and the rest — must remain executable by
`authenticated`, because a policy expression is evaluated as the querying role.
Revoking them fails closed on *everything*.

The honest cost: a member who knows another member's uuid can call
`profile_mode()` or `is_premium()` and learn a fact the UI would not show them —
including whether someone is in support-only mode. That is a small leak inherent
to putting the wall in a function, and the wall is worth more than the leak. It
is written here because it should be a known trade rather than a surprise.

`pnpm check:db` now audits both halves: eight functions that must be out of
reach, six that must stay in it.

### The fuse actually closes now

`sweep_expired_fuses` sets status and `closure_template` **in the same UPDATE**.
There is no ordering in which a chat is closed and the note is still to come.
`closed_by` stays null, because the fuse closed it and not a person — which is
what makes the note read as the mechanic rather than as the other member walking
away.

`pnpm check:sweeps` makes a real fuse expire and looks at what comes out: closed,
with a note, fuse cleared, `closed_by` null, and a chat with time left untouched.

### Hard delete cascades rather than enumerating

`purge_due_deletions` deletes the `auth.users` row; every profile-referencing
table cascades from it. A purge that lists tables is a purge that misses the next
table added. Verified: the profile, their connects and the chats hanging off them
all disappear.

Storage objects cannot cascade, so the cron removes them **after** the rows are
gone. A crash between the two leaves orphaned files, which is recoverable; the
other order leaves a deleted member's photos with a live profile pointing at
them. Orphans are reported in the response rather than swallowed.

### Cron

Three Vercel cron entries: fuse sweep every 15 minutes, connect sweep hourly,
purge nightly. Authorised by `CRON_SECRET` compared in **constant time** — a
timing-variable comparison on a bearer token leaks the token, and this endpoint
deletes accounts.

### Still open

Notifications are not wired. The §8 templates and the content-blind test exist,
`fuses_expiring_within` returns exactly who to tell and nothing about the chat,
but nothing sends: Resend's key is still a placeholder. The 24-hour warning is
therefore computed and discarded.

## 2026-08-14 — Preview Drop, browse and rooms

### A real bug in what I shipped yesterday

The Drop loaded its cards from `visible_profiles` **even in preview mode**, and
hid the name in the component. A support-only member's page therefore contained
every name in its payload — readable in the page source, whatever the screen
showed.

That is precisely what `preview_profiles`' own comment warns about: *"a blurred
image with the real name in the payload would not be a redaction at all"*. The
redacting view existed from Milestone 1 and I did not route the surface through
it.

Fixed, and fixed so it cannot come back: `DropCard` and `PreviewCard` are
**different types**, not one type rendered two ways. `PreviewCard` has no
`displayName` and no exact distance, and `FullCard` will not accept one. The
type checker caught two call sites the moment the split landed, which is the
whole argument for making it a type rather than a flag.

The preview placeholder is a plain shape, not a blurred image — there is no
image in the payload to blur, which is the point.

### Browse

Reads `visible_profiles`, so every wall applies before a row exists. The filters
narrow what is already permitted and cannot widen it, because nothing here
queries `profiles` directly.

The activity stat is derived from the rows on the page rather than from a
separate, friendlier query. §3.4 calls it an honest stat, and that is how it
stays one.

### Rooms

Community scoping is in RLS, so the page asks for every room and receives only
the ones the member may see. An absent room and a room that is not theirs return
the same 404, deliberately — a distinguishable "exists but not for you" would
leak the shape of the other community.

Room posts are tone-checked like every other member-written line. Rooms are
where newly diagnosed people arrive and where a cruel message does the most
damage, so the rule that protects a closure note protects this too.

**No DM button** (§7.2). The way to reach someone from a room is a connect, and
a note on the page says so rather than leaving the absence to be discovered.

Slow mode is displayed but enforced in the database. A second clock in the
action would be a clock that disagrees with the first one.

### Next

Milestone 6 — Stripe and premium gates — or Milestone 7's cron, which is what
makes the fuse actually close. The cron is the one with a promise behind it.

## 2026-08-14 — Inbox and chats: the fuse and the closure note

The surfaces the product is actually promising. Both are on the never-cut list.

### Silence is impossible by construction, and now the UI agrees

There is no "just decline" button and no "just leave" button. Declining opens a
template picker with one already selected; closing a chat does the same. A
member can choose *which* note is sent, never *whether* one is. The RPCs default
to template 0 for the same reason — the default is a note, not an absence.

The optional personal line is tone-checked before it goes anywhere, and the rule
that matters most there is that **it cannot mention anyone's status**. These
notes are read by someone being turned down. The violation messages are written
as sentences a person says rather than validator output, and the condition one
is deliberately the gentlest of them: someone who has just been told their note
is unacceptable does not also need to be told off.

### The fuse is visible everywhere it exists

On every row of the chat list and at the top of every chat, from
`fuse.countdown` — the same tested function, not a second calculation. §7.2 asks
for a visible timer, and a timer you have to go looking for is a deadline that
surprises people.

A proposed plan that the other person has not confirmed shows "waiting for them
to confirm" and **the fuse keeps running**, which is what the reducer already
does. A plan one person likes is not a plan.

### A fix worth making properly

The closed-chat view rendered template 1 with no name and produced a note ending
in a bare em dash. My first version stripped it with a regex in the component.
That was the wrong place: `renderClosureTemplate` now drops the signature along
with the name, with tests for undefined, null, empty and whitespace. This note is
the last thing one member says to another — it does not get to look like a bug.

### Known gap

**Nothing sweeps an expired fuse yet.** `needsSweep` exists and is tested, and
the countdown reads zero when the window has passed, but the cron that closes
the chat and delivers the note is Milestone 7. Until then a fuse runs out and
the chat sits there — the mechanic is right and the janitor is missing. Worth
being plain about, because "the fuse closed it kindly" is a promise the cron
keeps, not the reducer.

### Next

Browse, rooms, and the Preview Drop surface for support-only members.

## 2026-08-14 — The member app: Tonight's Drop, connect, mode toggle

Onboarding redirected to `/app`, which did not exist. The member shell does now,
and it enforces onboarding at the layout rather than per page — a member who has
not finished is sent back to the step they stopped at, so no half-signed-up
state can reach a surface.

### The drop is computed once a day and stored

Recomputing on every page load would hand back a different three whenever
anyone's activity changed: reload, and someone is gone. "Tonight's Drop" has to
be tonight's, so the chosen ids go into `drops` — unique on
`(user_id, drop_date)`, keyed to the member's own local date — and are read back
for the rest of the day.

The stored ids are a record of what was chosen, never a bypass. The cards are
re-read through `visible_profiles` on each load, so a member who blocks someone
after the drop was built stops seeing them straight away.

### SQL gathers, TypeScript scores

`drop_candidates()` returns facts and no judgements — no ordering, no weighting,
no limit. The ranking stays in `packages/logic/drop` where it is a pure function
with 38 tests. Two implementations of the thing that decides who members see
would drift apart quietly, and the drift would be invisible.

It is deliberately **not** SECURITY DEFINER: it reads `visible_profiles`, which
is security_invoker, so every wall in `can_view_profile()` still applies as the
caller. A definer here would be a second path to profiles that skips the wall.

**No quiz vector crosses the boundary.** `quiz_responses` is own-row-only under
RLS, correctly — a trait vector is derived from someone's answers. With
`QUIZ_QUESTIONS` empty the point is moot today, but the migration records what
has to happen when the quiz ships: compute the similarity in SQL and return one
number. Returning the vectors so the client can compare them would be the easy
version and the wrong one.

### A draft string had shadowed an approved one

I wrote `DRAFT_COPY.app.dropHeading = "Tonight's Drop"` — which is already
`COPY.drop.header`, spec copy from §3.4. Two sources of truth for a string the
spec had already settled.

There is now a test that flattens both trees and fails on any draft string
identical to an approved one. It immediately found a second case: four screens
each declaring `continueLabel: "Continue"` against the one Kevin approved for the
consent screen. All five now use a single `COPY.actions.continueLabel`.

### Enforcement stays in one place

The connect route checks nothing. Every rule — community and mode walls, daily
budget, the support-only restriction — lives in `create_connect` and the trigger
behind it, which run whatever path the insert arrives by. A check in the handler
would be a second, weaker statement of a rule already enforced where it cannot
be bypassed. The mode toggle is the same: `switch_mode` holds the cooldown, and
`packages/logic/modes` exists so a screen can grey out a control and say when it
lifts, not to decide anything.

### Next

Browse, inbox, chats. The fuse and closure surfaces are the ones that matter
most — they are what the product promises.

## 2026-08-14 — Milestone 3 logic: drop, connects, modes, referrals, tone

All five §6 mechanics are pure modules with tests. 346 tests in `packages/logic`,
up from 199. No surface consumes them yet — §12 says the logic lands first.

### The guarantees, and why each one is structural rather than remembered

**A drop connect costs nothing, and cannot be made to cost anything.**
`costOf(source, config)` takes the source and the config and nothing about the
member — so a drop connect cannot be priced differently for someone who pays,
because whether they pay is not in scope. A test reads the signature. The
curated three are the product; charging for them turns the mechanic that makes
this app different into the one that makes it the same.

**Premium raises the cap and never removes it.** `dailyAllowance` returns a
number. There is no Infinity, no null, no sentinel — expressing "unlimited"
would mean changing the return type, not adding a config value. Unlimited
initiation is the mechanic that produces the inbox nobody reads.

**Leaving dating is never gated.** The support_only branch of `switchMode` has
no condition in it, asserted by a test that reads the branch for `if` and
`ok: false`. A cooldown on the way out would hold someone in a dating pool they
have asked to leave, and Decision #18 makes support-only a shield, not a
privilege. Coming *back* is gated, and a test flicks modes five times to show
the clock never shortens.

**Referrals cannot reach matching.** §6.5 asks for this in as many words —
"assert in tests". Three ways: `DropCandidate` and `DropViewer` have no referral
field (field names scanned, not raw text — the comment saying there are none
matched the first version of that test); two candidates identical but for
smuggled-on referral properties score identically; and the whole scorer is
grepped for the words. A referral programme that quietly boosts reach is an
advertising product wearing a friend's face.

**The pool is never padded.** §6.1 step 4. `selectDrop` slices what it has and
has nowhere to pad from. Serving two real people beats serving three when the
third last opened the app in March.

**No pair of intentions scores zero.** §6.1 — "never a hard wall between dating
intentions". A zero would be a wall pretending to be a preference, quietly
making some members invisible to each other for good. Asserted across all
sixteen pairs, along with symmetry.

**A skipped quiz is neutral, not incompatible.** The quiz is skippable (§7.2);
scoring a skip as zero compatibility would make it compulsory in everything but
name.

**A closure line cannot mention a condition.** §6.6. These notes are read by
someone being turned down, and a parting shot about their status is the
cruellest thing this product could carry — and the one thing a blocklist
reliably catches. Twelve phrasings tested, including "are you clean", plus six
ordinary sentences that must pass untouched, plus every spec closure template.

### Three bugs found by tests

- A referrals test read `.reason` on a union where only one variant has it.
  Vitest passed it; `tsc` did not. Tests passing is not the same as tests
  typechecking, and only one of those two runs the type system.
- The drop's "no referral field" test matched the comment saying there are no
  referral fields. Now scans declared field names.
- The tone check's phone pattern allowed one separator character between
  digits, so `+1 (555) 123-4567` — which has a `") "` in it — slipped through.

### Next

Milestone 3's surfaces: the Drop screen, browse, connects, and the mode toggle,
all consuming the logic above.

## 2026-08-14 — Milestone 2 complete: the admin flag queue

### The reveal cannot happen without the log

§7.3 says condition data is never shown by default and a reveal "requires
explicit reason logged". Both halves are structural rather than conventional.

The queue query **does not select condition, community or U=U at all**. Not
hidden with CSS, not filtered in the component — absent from the payload, so it
cannot be read out of the page source. A moderator deciding whether a selfie
matches a face has no use for someone's diagnosis.

`admin_reveal_condition` writes the audit entry and returns the data **in one
statement**: a data-modifying CTE always executes when it is referenced, and the
select joins it. There is no ordering in which the read happens and the write
does not, and no later edit can separate them without visibly rewriting the
query. A function that logged first and selected second would be two statements,
and two statements can become one.

Proven behaviourally, not asserted: `pnpm check:admin` creates a throwaway
member and administrator, acts as each, and checks what actually happens —
a null, blank or eight-character reason is refused and writes nothing; a valid
one returns the data and logs the actor and reason verbatim; an ordinary member
is refused and logs nothing. That is the only way to test a SECURITY DEFINER
function's own authorisation, since nothing about its definition tells you
whether the check inside it works. It runs in a transaction that is rolled back,
so it is safe against the real project, and it is wired into CI.

### The queue found a real bug in my own constraint

Liveness runs at **step 2** of §7.2, before basics. So a member flagged at
liveness has an entirely empty profile — and an administrator approving them set
`verification_status = 'verified'` and hit `profiles_complete_when_verified`. A
raw 23514 in the moderation queue, for doing the one thing the queue exists to
do.

The conflation was mine: "passed the identity check" and "finished onboarding"
are different facts with different timing, and one column cannot carry both.
Split into `liveness_passed_at` and `onboarded_at`, with the completeness
invariant now hanging off the second — which is the fact it was always about.
Visibility never depended on it anyway: a profile with a null community cannot
match the community wall, so an unfinished profile is unreachable regardless.

### Also

An earlier draft of the admin migration re-created a policy that already existed
in `20260813000500`, and `CREATE POLICY` has no `OR REPLACE`. The push is
transactional, so nothing partially applied — worth knowing, since the failure
looked alarming and was not.

`check:sql` does not validate enum literals, which is how `'verification'`
reached a push that `moderation_kind` was always going to reject (the value is
`'verification_flag'`). Noted rather than fixed: parsing enum membership out of
SQL text is a bigger job than it repays right now, and the push catches it.

**Milestone 2 is complete.** Phone OTP, liveness adapter, verification pipeline,
admin flag queue, profile CRUD through onboarding, and the §9.1 consent screen.

### Next

Milestone 3 — mechanics core: the Drop, connects, modes, referrals, tone. The
fuse is already done.

## 2026-08-14 — Photos, and the end of the §7.2 flow

All nine onboarding steps are built and guarded. Every one 307s an anonymous
visitor to the phone entry.

### Uploaded photos carry GPS, and that would have undone the location design

A phone photo carries EXIF, and EXIF carries coordinates. Storing that would
hand out a member's exact position while the rest of the product rounds their
location to roughly a kilometre and shows a distance rather than a point.

sharp drops metadata unless asked to keep it, but a default is a thing that can
change, so there is a test. **The first version of that test was vacuous**: it
built its fixture with sharp's `withExif`, which silently discards a GPS block,
so it asserted "no GPS in the output" against an input that never had any.
TypeScript flagged `GPS` as an invalid key and I checked instead of suppressing
it. The fixture is now written with piexifjs, carries real coordinates, and
`expectsGps()` fails loudly if it ever stops doing so.

A second fixture bug in the same file: an orientation test built with `withExif`
read back as orientation 1, so it passed without testing anything. Now built
with `withMetadata({ orientation })` and asserted before use. Both were the same
mistake — trusting a fixture to contain what I asked for.

### The blur destroys data rather than hiding it

A gaussian blur over a full-resolution image only obscures; deconvolution can
recover some of it. So the blurred variant is **resampled down to 24px first**,
which throws the information away, and only then blurred and scaled back up.

That claim is tested directly rather than by proxy. The first attempt compared
file sizes, which measures how compressible an image is, not how much of it
survives — and it failed against a flat fixture that genuinely had nothing to
lose. The test now pushes both variants back through the same 24px bottleneck
and measures how much changes: the blurred one barely moves, because it has
already been through it. The fixture is a fine checkerboard, the most
high-frequency image there is and therefore the one with the most to lose.

The blurred variant is a **separate stored object**, generated at upload. §5.3
and the privacy policy both say the blur happens before the image is sent — a
CSS filter would mean shipping the real photo to someone who has not connected,
and would make that sentence false.

### Storage

Two private buckets (§4.2). `check:db` now asserts **no bucket is public** — a
public URL is a permanent, unauthenticated link to a member's face, and no
amount of RLS elsewhere takes that back. It also asserts that nothing grants
read access to `verification-selfies`: members write a selfie and never read it
back, and the liveness path purges it at decision time.

No storage policy grants read access to another member's photos. Those are
reached only through signed URLs minted server-side after `visible_profile_photos`
has decided which variant the viewer may see; a select policy here would be a
second, weaker path to the same bytes.

### Two build problems

sharp reached a client bundle, because the client form imported a constant from
the module that imports sharp. The error pointed at `detect-libc`, not at the
import that caused it. Limits now live in `photo-limits.ts` with no server
imports, and `photos.ts` carries `import "server-only"` so it cannot recur.

That guard then broke the tests — `server-only` throws on import outside a
Server Component, which is its entire purpose and also makes anything importing
it untestable. Aliased to a stub in `vitest.config.ts`, so the production guard
stays and the module it guards is still exercised. apps/web now runs tests in
the workspace suite.

### Next

Milestone 2's remaining pieces: the admin flag queue for verifications, and
profile CRUD outside onboarding.

## 2026-08-14 — Liveness, intention, radius; the quiz gap

Seven of the nine §7.2 steps are built and guarded. Photos is the remaining
screen; the quiz is deliberately inert (below).

### Two more places the schema assumed a finished profile

`display_name` and `birthdate` were the last NOT NULLs, and liveness runs
*before* basics — so a liveness result had nowhere to live. Migration
`20260814000200` drops them and creates the profile row **by trigger on
auth.users**, so it cannot be missed by a code path that signs someone in
without going through onboarding. Every step is now an UPDATE.

`search_radius_mi` carried `not null default 50`, which made "chose a radius"
and "has not reached that screen" indistinguishable — **the radius step would
never have rendered.** The default was doing two jobs; `20260814000300` keeps the
sensible starting value in `RADIUS.defaultMi` and lets null mean unanswered.

`profiles_complete_when_verified` grew to cover all six fields. `pnpm check:db`
now runs eight cases against the catalogue's own constraint text, including that
an under-18 birthdate is still rejected and that the sign-up trigger is present
and enabled.

### Two tooling bugs, both mine

**`check:sql` false-positived on the new trigger.** Its regex looked for
`on public.` within a window after the timing clause, and matched the `on` inside
`executi**on** function public.foo()` — reporting the function as a missing
table. Fixed with a word boundary and by reading the schema-qualified target
properly, so `auth.*` triggers are skipped rather than misread.

**And that failure did not stop the migration.** `pnpm check:sql | tail -3 && …`
takes its exit status from `tail`, so the `&&` saw success and pushed anyway. The
migration happened to be fine because the checker was wrong, but the guard was
not guarding. Chained verification now runs with `set -o pipefail`.

### The quiz is deliberately empty

§7.2 asks for 10–12 questions and **never writes them**, and §10's cut order says
in as many words: *"ship with intention-weighting only, quiz in fast-follow"*.
Ten invented questions would shape who members are shown to each other, which is
not a thing to guess at.

`QUIZ_QUESTIONS` is an empty array with that reasoning attached. The step stays
in the §7.2 order; `quizSettled` treats an empty question set as nothing to
answer, so onboarding does not stall on a blank screen — **and the step turns
itself on the moment a question is added.**

### Screens

**Liveness** does not decide anything itself. It calls the reducer in
`packages/logic/verification` and carries the result to the database, so
verified-vs-retry-vs-flagged stays in one tested place. Running out of attempts
shows the flagged panel, not a rejection — Decision #21 puts a human in the loop
on a risk flag, and the member is told plainly and asked to do nothing.

**Intention** renders the §3.4 lock notice verbatim and stamps
`intention_changed_at` on the first choice, so the 30-day clock is the same one
for everybody rather than starting whenever a member first edits it.

**Radius** re-clamps server-side. The slider enforces 5–250 and a slider enforces
nothing.

Verified: all seven steps 307 an anonymous visitor to the phone entry.

### Next

Photos — the heaviest step. `profile_photos.blurred_path` is NOT NULL, so
Decision #19's blurred-until-connected needs a blurred variant generated **at
upload, server-side**; the privacy policy already says the blur happens before
the image is sent, and that has to stay true. Needs the storage buckets (§4.2:
`photos`, private, signed URLs) and an image library.

## 2026-08-14 — Onboarding routing, phone entry, basics, community

### The schema assumed profiles spring into existence complete

`community`, `condition` and `intention` were `NOT NULL`, but §7.2 collects
basics **before** community — so a half-onboarded member could not have a row at
all. Migration `20260814000100` drops those NOT NULLs and moves the invariant to
where it actually matters: `profiles_complete_when_verified` requires them once
`verification_status = 'verified'`, and an unfinished profile is never visible
because both `can_view_profile()` and `visible_profiles` require verified.

Loosening a constraint deserves proof it did not loosen anything else, so
`pnpm check:db` now evaluates the **catalogue's own constraint text** against
representative rows — testing Postgres rather than a retyping of it. Five cases:
half-built is allowed, mismatched community/condition still rejected, U=U
without the HIV community still rejected, complete-and-verified allowed,
verified-with-a-gap rejected. An earlier hand-written version of this check used
the wrong enum values and passed vacuously, which is why it reads the real
definitions now.

### One door, and it cannot be walked around

`/onboarding` renders nothing. It resolves where the member belongs and sends
them there; every screen finishes by returning to it rather than naming its own
successor, so the §7.2 order lives in exactly one place.

`resolveStep` returns the **first** unsettled step, never the furthest reached.
That ordering is what makes consent a gate rather than a checkpoint: if the
consent copy changes and the old tick stops counting, a member returns to
consent even though every later answer is already stored. Verified for an
anonymous visitor: `/onboarding`, `/basics`, `/community` and `/consent` all
307 to `/onboarding/phone`. Typing the consent URL cannot walk past it, and the
consent **action** carries the same guard, so it cannot be POSTed out of order
either.

It also makes onboarding resumable — someone who takes a phone call at the
photos step comes back to photos. §7.2 targets under eight minutes and
re-answering four screens is how that target gets missed.

### Screens: phone, basics, community

Phone goes through Supabase Auth, which is the identity provider and the only
thing that can mint a session — our OTP stub covers the pure part (E.164,
expiry), not the round trip. Until Twilio is configured in the dashboard, `send`
fails and says so as a setup problem on our side, not something the member did.
Wrong code and expired code share one message deliberately; distinguishing them
tells a guesser which half they got right.

Basics enforces 18+ in the action and in the database. Age is a new tested pure
function comparing **calendar dates rather than instants** — doing this with
`Date` arithmetic is how someone turns 18 a day early in one timezone and a day
late in another. It also refuses dates that do not exist: `2025-02-30` passes a
regex and silently rolls into March. A test asserting a leap-day baby turns 18
on a leap day was wrong and is now corrected — 18 is not a multiple of four, so
that anniversary always lands in a common year.

Community's condition options depend on the community chosen, and
`CONDITIONS_BY_COMMUNITY` is asserted against the `profiles_condition_matches_community`
CHECK by a unit test — a drift there would offer a member a choice the database
then refuses, at the end of a form they already filled in. The pair and the U=U
eligibility are both re-checked server-side; a client component is not a place
to enforce anything.

Onboarding routes are `force-dynamic`. They were being prerendered, and the
environment parse throws before the first `cookies()` read, so relying on that
to opt out failed at build rather than bailing cleanly. They are per-member
screens; a cached copy would at best be wrong and at worst be someone else's.

### Draft copy

Screen headings and field labels are not in §3 or §9. They live in `DRAFT_COPY`
(`packages/config/src/draft-copy.ts`) — one file, clearly marked, for review in
one pass. Anything in `COPY` is spec-verbatim; anything in `DRAFT_COPY` is mine
and awaiting approval.

### Next

Liveness, intention, quiz, photos, radius — the remaining §7.2 steps.

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
| 4 | **Onboarding draft copy.** Headings, field labels and intention option names for every step, in `DRAFT_COPY`. Not spec copy. | Milestone 2 sign-off |
| 5 | **Quiz questions (10–12).** §7.2 asks for them and never writes them. `QUIZ_QUESTIONS` is empty and the step self-activates when populated. §10 permits shipping without it. | fast-follow |
| 6 | **Five room display titles.** §5.2 locks the slugs, not the titles. Slug-derived placeholders sit in `20260813000800_seed.sql`, flagged inline. Still the only user-facing strings in the build not taken from the spec verbatim. | Milestone 5 |
| 7 | **Stripe keys** — secret, webhook secret, and the three price IDs. | Milestone 6 |
| 8 | **Resend API key.** | Milestone 7 |
| 9 | **Liveness provider choice**, and its credential. Deferred 2026-08-14; running on `stub`. Recommendation is AWS Rekognition Face Liveness — see the spec correction above. | before launch |

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

