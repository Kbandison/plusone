# Project Updates

## 2026-08-17 — Twilio Verify is live, and the cheapest payment path is decided

**Verify is running.** The project reports `sms_provider: twilio_verify` with the
phone provider enabled — it had been off this whole time, separately from the
A2P wait. `OTP_PROVIDER=supabase_twilio_verify` locally.

Proved end to end without spending anything: a send to a reserved test number
came back with Twilio's OWN error 60200, "Invalid parameter To". Supabase reached
Twilio, the credentials worked, and the number was rejected before a message was
sent. A misconfigured provider returns `phone_provider_disabled` instead, so the
error is the evidence.

That surfaced a gap. Twilio rejects an unroutable number BEFORE sending, and it
arrives as `sms_send_failed` — which fell through to "We could not send a code
just now. Try again in a moment." For the usual cause, a typo or a missing
country code, that is advice which can never work. There is now an
`undeliverable` classification saying to check the number, and the onboarding
step uses the same classifier as /sign-in rather than a regex over the provider's
own words.

It deliberately does NOT pretend the way an unknown identifier does: the refusal
is about the number itself and says nothing about whether an account exists, so
showing the code screen would strand somebody waiting for a code that is not
coming.

**/dev/sign-in is now closed**, which is correct — the guard refuses whenever a
real provider is set. The real phone flow is the way in.

### Decision #22's mobile clause, resolved

Kevin asked for whichever path costs less and said he would take the store's
billing if it won. It wins, and the reason is that the ground moved: Google's
30 June 2026 structure charges its 10% service fee on external links TOO, so
linking out saves only the 5% billing fee and Stripe takes most of that back.

| Plan    | Play Billing | Link out | Signing up on the web |
| ------- | ------------ | -------- | --------------------- |
| 1 month | $16.99       | $17.11   | **$19.11**            |
| 3 month | $33.99       | $34.53   | **$38.53**            |
| 6 month | $59.49       | $60.66   | **$67.66**            |

Twelve cents a month, erased by 0.7% of drop-off at the browser handoff, and
carrying a self-reporting obligation to Google from 1 October. **Play Billing in
the app, Stripe on the web.** No code changed — there is no mobile app yet.

The larger finding is the channel, not the mechanism: a member who signs up on
the web nets $2.12 a month more than one who signs up in the app, because a
transaction that never touched the app is not Google's to charge for. That is
seventeen times the gap between the two in-app options. The app is worth building
for retention and for being findable; it should not be the front door.

### Functions moved to the database's region

The Supabase project is `aws-0-us-west-2` and Vercel defaults to `iad1` —
Washington DC. Every database round trip crossed the continent, and it is not one
per page: the layout calls `getUser()`, `loadFacts()` fans out five queries, and
only then does the page run its own. `regions: ["pdx1"]` puts the functions in
the same AWS region as the data, with `sfo1` as failover. Latency and cost, since
Vercel bills provisioned memory for as long as a function is alive and a function
waiting on the network is alive the whole time. Reasoning kept in
`apps/web/REGIONS.md`, because if the database moves this moves with it.

## 2026-08-17 — Decision #22's mobile clause is now the expensive option

Kevin asked for whichever payment path is cheaper on Android, and said he would
take the store's own billing if it won on price, since it is also the more
convenient one. It does win, and the reason is that the ground moved.

**Decision #22 says "Stripe Checkout on web; mobile opens checkout in browser."**
That was the right call when linking out was the way to avoid a store's cut
entirely. It no longer is. Google's structure from 30 June 2026 splits the fee
in two:

- a **service fee of 10%** on the first $1M of annual earnings, which applies to
  all auto-renewing subscriptions **and applies to external links as well**
- a **billing fee of 5%** in the US, UK and EEA, which is waived when you link
  out or use alternative billing

So linking out saves the 5% billing fee and nothing else — and Stripe then takes
2.9% + $0.30 of it back.

| Plan    | Play Billing | Link out to Stripe | Signing up on the web |
| ------- | ------------ | ------------------ | --------------------- |
| 1 month | $16.99       | $17.11             | **$19.11**            |
| 3 month | $33.99       | $34.53             | **$38.53**            |
| 6 month | $59.49       | $60.66             | **$67.66**            |

Linking out is ahead by **twelve cents a month** on the monthly plan. It is
0.6% of the price, and it buys three liabilities:

1. **A conversion cost far larger than the saving.** A 0.7% drop-off at the
   browser handoff wipes out the entire advantage on the monthly plan, 1.6% on
   the three-month. Real handoff loss is not measured in fractions of a percent.
2. **A reporting obligation.** From 1 October 2026 developers on external links
   must report transactions and remit the service fee to Google themselves. That
   is ongoing operational work, and getting it wrong is a policy breach rather
   than a bad month.
3. **Two payment paths to build and keep correct**, when the Stripe one already
   exists for web.

**Recommendation: Play Billing inside the Android app, Stripe on the web.**

### The number that actually matters

A member who signs up on loveplusone.app nets **$19.11** against **$16.99** in
the app — $2.12 a month, every month, because a transaction that never touched
the app is not Google's to charge for. That is seventeen times the difference
between the two in-app options.

The app is worth building for retention and for being findable in a store. It
should not be the front door. Worth confirming with Google's own terms before
building on it, since it is the largest single lever in the pricing and the
rules around it changed twice this year.

### Held for Kevin

Decision #22's mobile clause is LOCKED and this contradicts it, so nothing has
been changed. Above $1M in annual earnings the service fee rises to 20% on new
installs and 25% on existing ones, which is a different conversation and not
this year's. Apple is untouched by any of it — that decision comes when iOS does.

## 2026-08-15 — A hardening pass, and what four reviews found

I ran four parallel reviews — schema security, pure-logic correctness,
accessibility, and privacy leaks — and then verified every finding myself before
touching anything. Most were real. Everything below was reproduced first: the
database ones by running the exploit as a normal member against the live project
inside a rolled-back transaction, the logic ones by running the code.

### The worst of it: RLS is row-level, and the grant was deciding columns

Every policy in the schema scopes rows correctly. `grant select, insert, update
on public.profiles to authenticated` then handed every member all 26 columns of
every row their policy let them reach. As an ordinary member I could:

· `UPDATE profiles SET verification_status='verified' WHERE id=<self>` —
become verified without ever running a liveness check. Verification is the
wall the whole product rests on.
· `SELECT birthdate, location FROM profiles` — exact date of birth and a home
coordinate at ~1.1km for everyone in my pool. `tables.sql` says of location
"It is NEVER exposed".
· `UPDATE profile_photos SET storage_path='<victim>/<their>.webp'` — the
blurred path is public to anyone who can see the profile and the clear path
is that string minus "-blurred", so pointing my own row at it made the
server sign someone else's clear photo with the secret key.
· Clear the mode and intention cooldowns by writing the columns directly.

**A cooldown enforced in an RPC while the column stays writable is not a
cooldown, it is a suggestion with a nice error message.** `check:sql` would
never have caught any of this: the grant is valid SQL and every policy was
right. Only acting as a member and trying it finds it, which is what
`check:columns` now does on every CI run.

`visible_profiles` and `preview_profiles` had to become definer views, because
both compute age from birthdate and distance from location and an invoker view
cannot read a column its caller cannot. The views that exist to band and bucket
those values are now the only things allowed to see them.

### The purge job had never run

All five crons exported only `POST`. Vercel Cron invokes with `GET`, so all five
returned 405 on every fire — scheduled, monitored, and never once executed. For
the purge that means §9.3 deletion requests were being recorded and never
carried out, and **the failure mode of a job that does not run is silence.**

### The rooms refused their own subject

Room posts were tone-checked with the blocklist written for closure notes, which
bans "hsv", "hiv", "diagnosed" and "u=u". So the room titled "Newly diagnosed"
rejected the word "diagnosed" and the U=U room rejected "U=U". That rule exists
because closure and decline notes are delivered as notifications and §8 keeps
condition words off a lock screen — a room post never leaves the app.

Separately, two room slugs named a condition in the URL (`/app/rooms/hsv-general`,
`/app/rooms/hiv-u-equals-u`). §8 names URLs explicitly and the rule had only
ever been applied to notification bodies. A URL travels further than a screen
does: history, autocomplete on a borrowed phone, our access logs, Referer
headers.

**I fixed this the wrong way first and want it on the record.** I renamed the
slugs — but §5.2 names all five explicitly, so that overrode a locked decision
to satisfy another one. The two only conflict because the app routed on the
slug. Rooms are addressed by id now, the §5.2 slugs are back, and the lint
asserts the link never returns to the slug. **The identifier and the URL were
the same string by default and nobody chose that**; §8 constrains one of them
and §5.2 fixes the other.

### Three state machines with no way out

· The fuse had an `open` event exempted from the terminal guard. It returned a
swept chat to open — discarding the closure note §6.2 exists to guarantee —
and pushed a live chat's deadline seven days outward. Nothing dispatched it;
it existed only to be a hole.
· `health_consent` was a trap. Grant consent, walk back two steps, walk
forward, and every event refused except `go_back`. Onboarding could never
finish.
· A liveness session that never returned left the member somewhere no event
could move them, including an admin's. And `open_appeal` asked whether an
appeal had ever been opened rather than whether one was outstanding, so a
member got one appeal in their life and the rejection could never be
appealed — Decision #21's exact failure.

### Everything failed open on a bad number

NaN compares false against everything, so every `if (x < limit) refuse` read as
"allowed". The connect budget went unlimited, the intention cooldown unlocked
permanently, and a NaN score sorted to the **front** of the Drop rather than out
of it. Each one failed open in the direction of more contact.

### A live microphone

The voice recorder never cleaned up on unmount, so navigating away mid-recording
left the interval ticking and the getUserMedia stream open — a live mic and a
recording indicator on a member's phone after they had left the page.

Its `send()` also awaited a server action with no try/catch, so a dropped
connection pinned it at "sending" forever with no error and no way out but a
reload. **A loading state that never resolves is worse than an error, because it
looks like progress.**

### The connect budget was optional

`source` arrives from the client and 'drop' costs nothing, and nothing checked
that a drop had ever happened. Eight connects went out on a 3/day tier with the
counter still reading zero. Decision #15 exempts drop-card connects to nudge
toward curation; it does not exempt the word. The exemption is now spent per
person rather than per send — **curation is the first reply, not an allowance
attached to a name.**

`created_at` and `expires_at` were settable too, so a support-only member could
backdate out of the weekly window, and a pending ask could be given a hundred
years. A connect that never expires never sends the §6.2 note, which made it the
one way on this app to end something in silence.

### A block did not reach the rooms

Someone a member had blocked kept appearing in their room feed every day, while
`tables.sql` says blocks are "checked in both directions on every visibility
test". It filters reads, not writes: a block that removed someone's voice for
the whole room would be a moderation action wearing a safety control's clothes.
This is a widening — §5.3 requires blocks in `visible_profiles` and is silent on
rooms — so it is one policy and one predicate, easy to take back out.

### Photos travelled through our own domain

Every photo rendered as `GET /_next/image?url=<full signed URL>`, putting a live
ten-minute credential into our access logs and a CDN cache key.

The obvious fix is worse than the bug. The bytes behind a photo URL differ by
viewer — blurred for a stranger, clear for a connection — and **an optimiser
that caches by URL would let the first connected viewer populate an entry a
stranger then reads**, defeating Decision #19 through the CDN instead of the
database. So the browser fetches Supabase directly, and a 320px card variant is
written at upload to make that affordable: nothing here renders a photo above
72px and the stored original is 1600.

### The only navigation in the app was unusable on a phone

Nine labels in `justify-between` came to roughly 360px of text inside the 312px
a 360px screen leaves after the gutters, and `overflow-x: hidden` meant the
overflow was clipped rather than scrollable. **The last items were simply
unreachable, and nothing said so, because clipping never does.** The padding was
also on the `<ul>` rather than the links, so each target was a bare 13px line
box — about 21px, under WCAG 2.2's 24×24.

### Raw database text was reaching members

Eight actions returned `error.message` straight to the UI. Everything reachable
today is about the caller, so nothing leaked — but the message that would is
already written: `create_connect` raises "connect: target is support-only", and
the connect action swallows it by hand for exactly that reason. **One
hand-rolled exception is not a rule.** The default is inverted now, and a test
reads every `raise exception` in the migrations and fails on any text nobody has
classified.

### Copy written and never wired

After fixing a cluster of accessibility defects — disclosures that threw away
focus, successes that were never announced, a slider that said "50" while the
page said "50 miles", audio with no accessible name, three identically-named
textareas, a clipboard button that failed silently — I wrote a test for the
shape several of them shared: a string in `DRAFT_COPY` that nothing references.

It found four more real gaps:

· **The §9.1 consent screen had no link to the privacy policy**, though the
policy's own comment says it does.
· **The OTP screen had neither resend nor change-number**, so a phone number
typed wrong by one digit was a dead end on step one of onboarding.
· **`saveBio` existed and nothing called it** — the action, its tone check and
its copy all in place, with no way to reach any of it.
· `reportSent`, `dropEmptyHeading`, `photoNone` and `voiceTooLong` all unused.

There was also no prettier config, so both format scripts ran at the 80-column
default against a codebase hand-written at 100 — and globbed `.sql`, which
prettier cannot parse. Neither had ever passed. `format:check` is in CI now.

### The Drop was telling members the wrong things about itself

`quizCompat` scored a single shared answer as a **perfect 1.0** — higher than a
pair who answered all six questions and matched closely at 0.9996 — and a single
disagreement as 0, the worst it can give. The header claimed an unanswered trait
"pulls a cosine comparison toward the middle"; cosine ignores dimensions where
either side is zero, so **one shared answer is a one-dimensional comparison, and
one dimension is always either perfectly aligned or perfectly opposed.** Someone
who skipped the quiz outranked everyone who took it.

The radius ladder reported the rung it gave up at rather than the one that found
people, so three candidates all within four miles produced "Not many people
within 50 miles yet — showing within 250 miles", where both halves are false.

The 140-character limit was measured two ways: `checkTone` trimmed and the fuse
did not, so a line of 140 characters and a trailing space was green-lit on
screen and then refused by the state machine. Both counted UTF-16 units, so
eighty emoji were rejected against a hundred-and-forty-_character_ limit — and
so was anyone writing outside the BMP, silently, at half the length.

### Rows that were all the same row

Every Accept and Decline in the inbox had the same accessible name with nothing
to tell them apart, and accepting the wrong connect cannot be undone. The chats
list showed a status word and a countdown, so **three open chats were three
identical rows** — not just to a screen reader hearing "Open, Open, Open", but on
screen, where nobody could tell which conversation they were about to open.

And the blocked list showed "Blocked 14 August" with no name, because blocking is
mutual and the blocked member fails `i_can_view`. Two blocks on one day were
indistinguishable and undoing one was a guess. **A safety control you cannot read
is one you cannot undo** — so `my_blocked_members()` is the one place that wall
does not apply. It never returns blocks made _against_ you; that would be a probe,
and a far more sensitive one. This reverses a comment I wrote earlier saying names
should not be resolved there.

### Room posts were not as unattributed as they looked

Posts render with no author, so a member writing in "Newly diagnosed" reasonably
reads the room as unattributed. The page shipped the author's uuid to the client
anyway, where any reader could lift it from the payload and open
`/app/connect/<uuid>` for a name, a photo and prompts. Report and Block now
resolve the author server-side from the message id.

Also: the two most-used inputs in the product — the chat composer and the room
composer — had no accessible name at all, and chat messages distinguished sender
by colour and alignment alone.

## 2026-08-15 — Milestone 8: the marketing site

`/how-it-works`, `/pricing` and `/terms` join the pages already there. Every
footer link resolves; a shared `SiteFooter` replaced the four hand-rolled navs I
had accumulated, because the legal links are the ones that must not go stale.

### How-it-works quotes the app rather than describing it

The explainers members read inside the product — the fuse, support-only, the
verification pitch — are §3.4 verbatim and pulled in from `COPY`, not rewritten
in marketing voice. A test asserts it. **A marketing page that describes a
mechanic differently from the screen that runs it is the beginning of two
products**, and the difference always favours the marketing page.

The order is the order someone experiences it — verify, Drop, connect, fuse,
closure, step back — not the order it was built in and not the order that leads
with the cleverest part.

### Pricing gives the "never" list equal weight

`PREMIUM_NEVER` sits under `PREMIUM_INCLUDES` in the same size, on the page that
sells the thing. Every other app in this space sells exactly that list, which
makes it the more interesting half of what is on offer — and burying it would
make the pricing page the one place the product argues against itself.

### The terms, and the one lie worth avoiding

DRAFT, needs counsel like the privacy policy (Decision #30).

Two positions in it are deliberate and worth Kevin's attention:

- **Verification is a claim about identity, not about character.** The terms say
  so in those words, and tell members to meet in public and tell someone where
  they are going. For an app whose pitch is "every profile is a verified human",
  implying that verified means safe would be the most consequential lie
  available to it. A test asserts the sentence stays.
- **No content licence.** A dating app taking a perpetual worldwide licence to
  members' photos is standard, and standard is not a reason. The terms say
  members own what they write, that we store it to show the people they chose,
  and nothing more. A test rejects the words "perpetual", "irrevocable" and
  "worldwide licence".

The never-buy promise appears in the terms as well as on the pricing page, so it
is contractual rather than marketing.

### Where the build is

Milestones 1–8 are built. What remains is credentials, the copy Kevin has not
read, and counsel on two legal documents.

## 2026-08-15 — Config and metrics: Milestone 7 closes

### "Hot-read by logic" was half true

§7.3 says the config table is hot-read. The SQL functions were — budgets and
cooldowns go through `config_int()`. The TypeScript was not: `selectDrop` was
called with no config argument, so it used its compiled-in defaults, and **an
administrator changing the Drop weights would have changed nothing**. Silently,
which is the worst part — a settings screen that does nothing looks exactly like
one that works.

`tunable_config()` returns every key as one object, readable by members so the
Drop can pick it up without a service client in a request path. The values are
not secret; most of them are published in the FAQ.

The weights were not seeded either, so even with the plumbing fixed they would
have been uneditable — `admin_set_config` only accepts keys that already exist.
Seeded now from the §6.1 launch values, with the compiled numbers still the
fallback: a deleted row must not change how the Drop scores.

### There is no key that sells an exemption

§3.3 bans selling exemptions, and the way that stays true is that there is
nothing to sell. `admin_set_config` refuses unknown keys, so nobody can add
`drop.per_premium_member` today and wire it up next month. `check:config`
asserts no key contains "extend", "exempt", "bypass", "unlimited" or "boost".

Every change is audited **with its previous value**. A config change that cannot
be read backwards is one nobody can undo at 3am.

### The metric that is the product

§7.3 asks for the "closure vs ghost-equivalent rate = 0 by construction". It has
its own panel at the top of the dashboard, and it is **measured rather than
asserted**: a count of chats closed with no note. It should be structurally
impossible, and if it ever moves, the product's central promise has broken and
this is the only screen that would say so.

Everything else is counts. No member appears in the metrics by name or id — a
dashboard is the easiest place for a product to start looking at individuals,
because it is the one screen where doing so feels like analysis. A check asserts
no uuid appears in the payload.

### Milestone 7

Admin, cron and notifications are done bar the Resend key. Eleven live gates
now, and 594 tests.

## 2026-08-15 — Stripe, and proving money buys nothing

Milestone 6's other half. The keys are still placeholders, so checkout fails
with "Payments are not switched on yet" — everything else is real.

### The webhook

Three things it gets right deliberately:

- **The signature is verified before anything is read**, against the raw text.
  This endpoint is public by necessity and the body is the only thing telling us
  somebody paid; an unverified body is a stranger's claim to be premium. The
  failure response carries no detail, because a verification error that explains
  itself is a forgery oracle.
- **It is idempotent.** Stripe retries on any non-2xx and will deliver the same
  event twice on a good day. Every write is an upsert keyed on the member, and
  `current_period_end` comes **from the event** rather than from a clock — so
  replaying a three-month-old event cannot push anybody's access three months
  out.
- **An unhandled event is acknowledged, not rejected.** Returning an error for
  an event we do not care about teaches Stripe to retry it forever.

An unattributable payment — no member id on the session — is acknowledged and
logged loudly rather than retried. Stripe cannot fix it by trying again; a human
has to.

### §9.7 holds because there is nowhere to put a name

Stripe knows who is paying, because a processor must. Our database stores a
customer id, a subscription id, a status and a period end. `check:premium`
asserts `subscriptions` has no column containing `name`, `email`, `address`,
`card`, `last4` or `postal` — the promise is kept by the schema rather than by
the code being careful.

### The check that matters

§3.3: _"No selling exemptions from mechanics. Never monetized. Ever."_

`packages/logic` already asserts the pure functions cannot see who pays. But if
premium ever starts buying an exemption it will be through a policy or an RPC,
not through a reducer — so `pnpm check:premium` puts a **real paying member and
a real free member side by side against the live walls**:

- premium does not see a support-only member, and cannot connect to one;
- premium does not see the other community;
- premium does not see someone who blocked them;
- premium cannot extend its own fuse — **and there is no UPDATE policy on
  `chats` or `connects` for anyone to be exempted with**;
- `drop.count` is one global value, and `drops` has no per-member count column
  to raise;
- premium raises the daily connect budget from 3 to 10 and it is still a cap.

That last pair is the whole shape of it: the only thing money changes is a
number that was already a limit.

### And it says so on the page that sells it

`PREMIUM_NEVER` is printed on `/app/premium`, under the plans, in the same
weight as what premium does give. A promise made only in a spec is a promise
nobody can hold you to.

## 2026-08-15 — The quiz, the FAQ and the community guidelines

Kevin authorised writing all three. They are drafts and he will say if they are
wrong.

### The quiz — 12 questions, six traits

Held to three rules, in order of importance:

- **Never about anyone's status.** Not obliquely, not "how open are you about
  health". The quiz shapes who members are shown to each other, and a question
  that sorted people by how they feel about their diagnosis would be the app
  doing the sorting nobody asked for.
- **Answerable by someone having a bad month.** Nothing that rewards being
  interesting or punishes a quiet answer.
- **No right answer.** Weights run negative to positive along a trait rather
  than low to high along a quality, and a test asserts every question balances
  to zero. There is no way to score well here, only to score like someone.

Answers become a six-element trait vector in `packages/logic/quiz`. The raw
answers stay in `quiz_responses`, which is own-rows-only: "which option did they
pick for question nine" is a more revealing thing to hand around than a
similarity score.

**A partial quiz is a valid quiz.** Every trait averages only what was actually
answered, so stopping at question four gives a real vector rather than a
distorted one. §7.2 makes the whole thing skippable; making it all-or-nothing
inside would be the same rule broken one level down.

Adding questions turned the onboarding step **on** — `quizSettled` reads
`QUIZ_QUESTIONS.length`, so `/onboarding/quiz` went from unreachable to a 404
the moment the array filled. Built. A skip writes an **empty row** rather than
no row: `resolveStep` reads presence, so no row means unanswered and a member
who skipped would meet the screen forever.

The skip is a plain button of equal weight — not hidden, not greyed, not behind
a confirmation. §3.3 bans engagement-bait and a skip you have to fight for is
exactly that.

### The FAQ

Written as the page someone reads while deciding whether to trust this, which
makes it the worst possible place to round up. **Every claim in it is asserted
against the product**: three in the Drop and the same for everyone, seven days on
the fuse and no way to buy more, the selfie deleted as soon as the check
finishes and no documents ever, deletion inside seven days and not a hidden
account, leaving dating instantly and thirty days to come back, the blur
happening before the photo leaves our servers.

If one of those stops being true, a test fails.

### The community guidelines

Outing is first on the removable list and the only one described as permanent.
It is the harm this community has actually experienced, often from people who
thought it was harmless.

"Nobody owes you their medical history" gets its own section, because the most
likely way this app becomes unpleasant is not abuse but interrogation.

Neither document explains what HSV or HIV are. Everyone here already knows, most
of them better than we do, and a page of medical basics on a dating app reads as
talking down to the people using it. A test rejects clinical vocabulary for the
same reason.

Both are checked against §3.2's banned terms and §3.3's banned claims.

## 2026-08-15 — The moderator's side of the queue

Reports have reached the moderation queue since this morning and nothing
displayed them. The same half-built loop as the purge job with no delete button
and the report with no reader: every piece present, nothing joined up.

`/admin/reports` and `/admin/members` close it.

### What a moderator sees, and what they do not

`admin_open_reports()` returns the reported text, the reporter's account of what
happened, the reason, and the subject's display name. It returns **no
community, no condition and no U=U** — deciding whether a message was abusive
does not require knowing anybody's diagnosis, and §7.3 says condition data is
never shown by default.

`admin_member_lookup()` is deliberately thin: no listing, no browse, and a query
under two characters returns nothing rather than everyone. A moderator following
a report needs to find one person. Anything more is a directory of members with
a search box on it.

Condition data stays behind `admin_reveal_condition`, which still writes the
reason in the same statement as the read. That control now appears on both admin
screens rather than only the verification queue.

### Decisions are one-way

`admin_resolve_report` accepts only `resolved` or `dismissed`. `open` and
`in_review` are states a queue moves through, not decisions, and letting this
call set them would make a resolved report reopenable by the same function — an
audit trail of a decision that can be un-decided is not much of a trail. It also
refuses a report already decided, so two moderators clicking at once produce one
outcome and one audit entry.

### `pnpm check:moderation`

Eighteen checks: the report appears with its text and detail, carries no
condition column, cannot be resolved by an ordinary member, cannot be reopened,
leaves the queue when decided, is audited with the moderator's note, cannot be
decided twice, and lookup returns nothing for a one-character query and nothing
at all to a non-admin.

Kept as its own script rather than folded into `check:admin`. I tried the merge;
two scenarios in one file meant two sets of bindings fighting over `open`,
`cols` and `after`, and five minutes of renaming variables bought nothing.

## 2026-08-15 — Photos, and Decision #19 had never worked

Photos have been uploaded, processed and stored since the onboarding work. No
surface rendered one. Going to fix that found something worse.

### `visible_profile_photos` could never return another member's photo

The view is `security_invoker`, so the `profile_photos` policy applies
underneath it — and that policy is **own-rows-only**. The view written to be the
one path to another member's photo, resolving blurred-until-connected
server-side, returned nothing but your own.

**Decision #19 has been decorative since Milestone 1.** Nothing leaked: it
failed closed, and no surface rendered photos, so there was no symptom. It also
did not work, and the comment in the RLS file confidently describing how it
worked was written by me.

### The obvious fix was the wrong one

Adding a `profile_photos` select policy for members you can see would make the
view work — and would let anyone query `profile_photos` directly and read
**both** `storage_path` and `blurred_path`. The clear photo of someone who chose
blurred-until-connected would be one query away. That is exactly what Decision
#19 exists to prevent.

So the view became the authority: SECURITY DEFINER, doing its own authorisation
with `i_can_view()`, exposing only the variant it chose. `profile_photos` stays
own-rows-only, so the direct path still sees nothing of anyone else.

It is the only definer view in the schema. `check:db` now permits that exception
**only with its justification asserted** — the view must call `i_can_view` and
must return one resolved path rather than both. An exception that stops being
safe stops passing.

### `pnpm check:photos`

Eleven checks: a clear profile returns the clear path; a blurred-until-connected
profile returns the **blurred** path and the clear one never appears in the
payload; connecting reveals it; someone in another community gets no row at all;
`profile_photos` returns nothing for another member but still returns your own;
and no storage policy grants read beyond your own folder.

Those last two are the ones that matter most — they assert the obvious fix was
not taken.

### Rendering

Signed URLs are minted **after** the view has decided, never before. Reading the
view as the member is what applies the wall and picks the variant; the service
client then signs the path it returned. Signing first would work, and would hand
out clear photos of people who chose blurred.

Members deliberately have no read policy on each other's storage objects, so
this is the only route to another member's photo — one decision, one path.

Photos now appear on drop cards, browse, the connect composer and the profile. A
blurred card says so, because a blurred photo with no explanation reads as a
broken image.

## 2026-08-15 — Blocking and reporting, and a regression I caused

Going to build the safety UI turned up three problems, two of them mine.

### REGRESSION: administrators could not read the moderation queue

`20260814000900` revoked `is_admin(uuid)` from `authenticated`, and
`20260814001000` introduced the no-argument `is_admin()`. The
`moderation_queue` policy was never updated and still called the one-argument
form. Postgres resolves overloads by arity, so a reachable `is_admin()` does not
help a call written as `is_admin(uuid)` — every administrator got _"permission
denied for function is_admin"_ and the moderation queue was unreadable.

Missed because `check:admin` exercises the admin RPCs, which are SECURITY
DEFINER and never go through that policy. **The queue's own read path had no
test.**

`check:walls` now reads every member-facing table as a member and every
admin-facing one as an administrator — 23 tables. A policy that cannot call what
it references fails _closed_, which looks like "there is no data" rather than
like a permissions error, so nothing complains at the time.

### A report reached nobody

`reports` and `moderation_queue` have both existed since Milestone 1 with
nothing connecting them. A member could file a report and no moderator would
ever see it — the same shape as the purge job that ran nightly with no way to
ask for deletion. Verification flags had the same hole from the other side:
`admin_decide_verification` resolved queue rows that were never created.

Both now by trigger. A queue entry that depends on the caller remembering is a
queue entry that goes missing on the path nobody tested.

### And the trigger could not have worked

```
column "kind" is of type moderation_kind but expression is of type text
```

A `CASE` returning string literals is `text`, and Postgres will coerce a literal
written directly into a column but not the result of an expression. Both
triggers raised on every fire, so filing a report failed entirely.

`check:sql` passed — the SQL is grammatically fine. The migration applied
cleanly, because **creating a function does not run it**. This is the clearest
case yet for behavioural tests over structural ones: it was found by filing a
real report as a real member and watching it fail.

### The UI

Blocking asks nothing and explains nothing. A member reaching for it is often
having the worst moment this product will give them, and a dialogue asking them
to justify it is the wrong thing to put in the way. It is immediate and mutual —
`is_blocked_either_way` is in every wall — and reversible from Settings, which
is where the explaining belongs.

Reporting offers blocking alongside but keeps it a separate tick. They are
different asks: "I never want to see this person" and "somebody should look at
this". Conflating them means a member who wants a moderator to act has to lose
their own view of the evidence to ask.

Reports are **deliberately not tone-checked**. A report describes something that
happened, and the words for it are often the words that were used. Refusing one
for its language would silence the person it exists to protect.

The blocked list in Settings shows dates, not names. A blocked member is
invisible through `visible_profiles` by construction, and reaching around that
to show their name would be the one place the block does not hold.

## 2026-08-14 — A way in, and a near-duplicate the guard missed

Every screen in the product was reachable only by typing a URL. The home page
had no links at all — not to sign-in, not to the app, not even to the privacy
page it was legally pointing at. Nine onboarding steps, eight member surfaces
and an admin queue, all behind a front door with no handle.

`/onboarding/phone` and `/privacy` are now on it. One link covers both signed-in
and signed-out: the phone screen already redirects a member with a session to
`/app`, so the page does not need to ask who is knocking — and does not need to
become dynamic to find out.

### The draft-copy guard was not strict enough

Writing the call to action, I drafted _"Every profile is a verified human. Two
minutes, no waiting, no fakes."_ — which is §3.4's verification pitch with one
word removed. It was already in `COPY` as `marketing.verificationPitch`, with
"Every profile **here** is".

The guard added yesterday compares strings for equality, so it saw two different
strings and said nothing. **A one-word divergence is worse than an exact copy**:
an exact duplicate is obviously redundant, while a near-duplicate reads as
approved and is not, and drifts further every time someone edits the wrong one.

The guard now also fails on any draft sharing 80% or more of its words with an
approved string, reporting both and the score. Short strings are exempt —
"Continue" and "Save" will always collide and mean nothing by it.

The home page uses `COPY.marketing.verificationPitch` directly.

### Still a holding page

§7.1's marketing site — how-it-works, pricing, FAQ, community guidelines, legal
— is Milestone 8, and its FAQ and guidelines copy is not in the spec.

## 2026-08-14 — Prompts: the connect button could never have worked

Going to build profile editing surfaced a broken path.

### The bug

`connects.prompt_id` and `prompt_reply` are both **NOT NULL**. The drop card's
Connect button POSTed straight to `create_connect` with `p_prompt_id: null` — an
insert the column would always have refused. That button has been dead since it
was written.

Underneath it, a larger gap: **the prompts feature did not exist**. No profile
had prompts, so there was nothing to reply to and no connect could be sent by
any route. Decision #14 makes "connect = reply to a specific prompt" the
mechanic that stops swipe-and-spray, and it was the one mechanic with no
implementation at all.

### SPEC GAP — the prompts themselves

§5.2 gives profiles a `prompts` column and Decision #14 requires replying to
one, but the spec never writes the prompts. Unlike the quiz questions — which
§10 explicitly allows deferring — **nothing works without these**: no prompts,
no connects, no product.

So eight are drafted in `PROFILE_PROMPTS`, chosen to be answerable by someone
having a bad month, to invite a specific reply rather than a clever one, and
never to ask about anyone's status. A prompt fishing for a diagnosis story would
undo the point of the place. They are held to the same tone bar as a closure
note, asserted in `packages/logic`'s tests — not `packages/config`'s, which
cannot import the tone checker: config is the leaf and logic depends on it.

### The connect is now a reply

`/app/connect/[id]` shows the target's prompts, and the member picks one and
answers it. That is the entire interaction — no openers, no swiping. It reads
through `visible_profiles`, so someone who cannot see a member cannot reach the
compose screen either: a 404 rather than a form that fails on submit.

A refused connect gives a deliberately vague message. A specific one would say
which wall was hit — the probe leak by another route.

### Profile editing

Prompts and bio, both tone-checked. A prompt answer is the one piece of free
text on a profile and the first thing a stranger reads, which makes it the
obvious place for something that should not be there.

A member with no prompts **cannot receive connects**, and the editor says so
plainly rather than letting them wonder why it is quiet. That is a real
consequence of Decision #14 and worth stating: §7.2's onboarding order has no
prompts step, so every member finishes signing up unreachable until they visit
their profile. **Flagged — that may want a step in the flow.**

## 2026-08-14 — Notifications: content-blind by construction

§8's templates and their test existed from Milestone 1. What did not exist was
anything that sent them — the fuse warning cron computed exactly who to tell and
threw the list away.

### The check moved from the test to the code

A test asserting the templates are clean proves _the templates_ are clean. It
does nothing about a future caller assembling a body from a chat, a display
name, or a profile field — which is how content-blindness actually gets lost.

So the rule is now enforced at runtime, in two places:

- **`buildPayload` takes an event, not a body.** There is no parameter through
  which a name, a preview or a profile field could arrive. That is the first
  half.
- **It re-checks its own output** against the banned terms before returning, and
  throws `ContentBlindViolation` naming the field and the term. The check is on
  the OUTPUT, so it holds regardless of how the text was assembled or from what.

The stub notifier checks again before sending. That is not redundancy for its
own sake: a provider is the last thing to touch a payload, so it is the last
place a leak can be caught, and a real provider should do the same.

It **throws rather than sanitising**. A payload that needed cleaning is a bug,
and a quietly-cleaned one is a bug that ships.

### The fuse warning sends

`fuses_expiring_within` returns chat ids, member ids and expiry times and
nothing about what any chat contains — so there is nothing in that path that
could reach a payload even by accident. The body says "One of your chats closes
tomorrow", which does not say which.

Recipients are de-duplicated: someone with three chats closing tomorrow gets one
notification. Three identical vague pushes are worse than one, because the count
is itself information the member did not ask to broadcast to their lock screen.

### One interface fix

The stub's `send` threw synchronously from a `Promise`-returning method, so a
caller would have needed both a `try/catch` and a `.catch` — and the one they
forgot would be the one that fired. Now `async`, so a refusal is always a
rejection.

### Still a placeholder

Resend's key. The seam is done and the stub refuses to construct in production,
so a deploy that forgot to pick a real notifier fails loudly rather than
silently sending nothing. A notifier that quietly discards is worse than none,
because nothing looks broken.

## 2026-08-14 — The never-cut list: deletion and voice notes

Two items on §10's never-cut list were not built, and one of them was worse than
it looked.

### A member could not ask to be deleted

The purge job ran nightly. `request_deletion()` existed and was tested. §3.4's
confirmation copy was written. **Nothing called any of it** — there was no
surface, so hard delete was a promise the product could keep and had no way of
being asked to.

`/app/settings` now has it, with §3.4's copy verbatim: _"This cannot be undone —
and we mean actually deleted."_ A product that says that has to make the control
match, so it asks the member to type DELETE rather than tap a red button they
could hit by accident.

Deliberately no soft-delete in the meantime. The account works normally until it
stops existing — a seven-day limbo where you are invisible but not gone is a
worse experience than either end of it.

### Voice notes

`messages.voice_note_path` and `voice_note_seconds` have been there since
Milestone 1. What was missing was somewhere to put the audio.

**SPEC GAP:** §4.2 lists `photos`, `verification-selfies` and `room-media` (v2)
and no bucket for voice. The column implies one, so `voice-notes` is added —
private, 4 MB, audio MIME types only. Flagged rather than assumed to be an
oversight.

The path is keyed on the **chat**, not the sender: who may hear a note is
decided by chat participation, so the path expresses the same rule the messages
policy uses. Playback goes through a signed URL minted per render, valid ten
minutes. A public path would be a permanent link to somebody's actual voice.

Two details that are the point rather than polish:

- **The row is written first**, then the audio uploaded to a path built from its
  id. The other order needs a path invented before there is anything to name it
  after, and orphans an object whenever the insert then fails. If the upload
  fails the row is deleted, so no message exists that plays silence.
- **A closed chat refuses audio too**, enforced in the storage policy via
  `chat_accepts_messages`. Without it a member could keep talking into a
  conversation that had already closed kindly.

The recorder is deliberately plain — a button, a running count, and a chance to
hear it before it goes. No waveform, no filters. The point of the feature is
that it is unmistakably a real person, and production polish works against that.
It stops itself at the two-minute cap rather than letting someone talk past it
and lose the recording.

### check:db now asserts the never-cut list

Voice notes, hard delete, deletion requests, the fuse sweep and versioned
consent each get a check that they have somewhere to live. Discovering at launch
that one of them quietly has nowhere is the failure this prevents.

## 2026-08-14 — Referrals: the invite link, attribution and payout

Milestone 6's growth half, which needs no Stripe. The invite landing is the
piece with the most riding on it.

### The landing page says nothing

§3.4's copy is verbatim and every word of it was chosen to out nobody: _"You've
been invited to Plus One" / "A private community built on trust and real
connection."_ This link gets posted in closed groups and forwarded between
people, and anyone who sees it before tapping through learns only that a private
community exists.

The metadata matters as much as the page — a link preview is seen by more people
than the page is — so `title`, `description` and Open Graph all carry the same
neutral copy, and the route is noindex.

The code goes to an httpOnly cookie rather than through the URL of the next
page. It is attributed once the invitee has an account, which is the first
moment there is anybody to attribute it to.

### The conversion is the database's to notice

§6.5 counts a conversion when the invitee reaches `verified`, not when they sign
up. That is an event the database can see and the app cannot be trusted to
notice, so a trigger on `verification_status` records it — covering onboarding,
the admin queue, and whatever sets it next. An app that has to remember is an
app that eventually forgets.

### SQL records, TypeScript decides

Same split as the Drop. The tier rules live in `packages/logic/referrals` with
17 tests; the cron job replays that reducer against each unpaid conversion **in
order**, so a job catching up on several pays each one what it was worth at the
time rather than what the latest is worth.

Idempotent by construction: `premium_grants.source` carries the conversion id,
and `unrewarded_conversions()` only returns rows with no such grant. The job can
run twice, or crash halfway, without paying anyone twice — verified.

Grants **stack from the end of existing premium** rather than from now. Granting
from now would quietly shorten the reward for whoever earns them fastest.

Decision #25's ten-conversion tier is recorded `pending_approval` and **not**
granted. Six months is worth a human look; auto-granting it is how a referral
programme becomes a fraud target.

### `pnpm check:referrals`

Fifteen checks against a live database, rolled back: the code is permanent, a
member cannot shop their signup to a second referrer, nobody refers themselves,
an unknown code fails quietly, signing up converts nothing, verification
converts it, the job sees each conversion exactly once, grants stack, and a
signed-in member calling `grant_referral_premium` is refused.

That last one caught the script rather than the code. `set_config` is
transaction-local, so a member's claim persisted into what the test called a
cron call — and `assert_not_end_user` correctly refused it. The guard was right
and the test was lying about who was asking.

### Still open

Stripe. The three price IDs and the secret are placeholders, so subscriptions,
the premium gates and the paid tier are unbuilt. Referral premium grants work
without it, since a grant is a row rather than a payment.

## 2026-08-14 — The probe leak is closed

Yesterday I documented a leak as an accepted cost: RLS helper predicates have to
stay callable by `authenticated`, and most took a viewer argument, so a member
could substitute any uuid and ask questions about other people. On a second look
that framing was wrong. The leak was not the grant — it was the **argument**.

Every one of those predicates was called with `auth.uid()` in practice. Taking
the parameter away makes the question unaskable rather than merely discouraged.

| Was askable about anyone                                    | Now                              |
| ----------------------------------------------------------- | -------------------------------- |
| `is_admin(uuid)` — who moderates                            | `is_admin()` — am I one          |
| `is_premium(uuid)` — who pays                               | revoked; only a trigger calls it |
| `profile_mode(uuid)` — who is support-only                  | folded into `connect_permitted`  |
| `is_blocked_either_way(a, b)` — have two others blocked     | `preview_permitted(other)`       |
| `has_accepted_connect(a, b)` — have two others connected    | `i_have_connected_with(other)`   |
| `is_member_of_room(user, room)` — is someone else in a room | `i_am_in_room(room)`             |
| `is_chat_participant(chat, user)`                           | `i_am_in_chat(chat)`             |
| `can_view_profile(viewer, …)` — what can someone else see   | `i_can_view(target, …)`          |
| `shares_room(a, b)`                                         | dropped — nothing called it      |

The connects policy now calls one compound predicate,
`connect_permitted(target, room)`, instead of three separately-askable facts. A
false does not say _which_ wall stopped it, and the initiator is implicit, so it
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
across many targets would let someone infer _something_ about who is reachable.
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

| Function                 | What an arbitrary caller could do                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `purge_due_deletions`    | **Delete every account whose 7-day window had elapsed.**                                   |
| `sweep_expired_fuses`    | Close chats across the whole system.                                                       |
| `sweep_expired_connects` | Expire connects across the whole system.                                                   |
| `audit`                  | Write arbitrary audit entries. A forgeable log is worse than none — it still looks intact. |

Found by a check I wrote _while adding the sweeps_, asserting they were
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
Revoking them fails closed on _everything_.

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

That is precisely what `preview_profiles`' own comment warns about: _"a blurred
image with the real name in the payload would not be a redaction at all"_. The
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
member can choose _which_ note is sent, never _whether_ one is. The RPCs default
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
privilege. Coming _back_ is gated, and a test flicks modes five times to show
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
_before_ basics — so a liveness result had nowhere to live. Migration
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
in as many words: _"ship with intention-weighting only, quiz in fast-follow"_.
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
URL, so it carried a `/rest/v1/` path and every request 404'd with _"Invalid path
specified in request URL"_ — a long way from its cause. Corrected in `.env.local`,
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
  TS >= 7.1). There is no config workaround: `typescript` is a _peer_ of
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
the face against _a government-issued photo ID_, and it is enabled as
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
required for every provider _except_ stub. The single-opaque-key shape will not
survive the real choice — AWS needs an access key id, secret and region, and Stripe
Identity has no key of its own — so it stays as-is rather than guessing a shape.

Mechanics are now namespaced in the `@plusone/logic` barrel (`fuse.transition`,
`verification.transition`). Six more state machines are coming and they all want to
call their reducer `transition`.

### AWAITING KEVIN

Two lists. The first is copy **I wrote and Kevin has not read** — it works, it is
tested, and it is nobody's voice but mine until he says otherwise. He asked
specifically to be reminded of these, so they lead.

| #   | Written by Claude, not yet reviewed                                                                                                                                    | Where                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| A   | **Compatibility quiz** — 12 questions, six traits. These shape who members are shown to each other, which makes them the highest-stakes of the three.                  | `packages/config/src/draft-copy.ts` → `QUIZ_QUESTIONS`                              |
| B   | **FAQ** — 12 answers. Every factual claim is asserted against the product by a test, so the risk is tone rather than accuracy.                                         | `packages/config/src/guidelines.ts` → `FAQ`, live at `/faq`                         |
| C   | **Community guidelines** — 8 sections. Sets what gets someone removed, so it is the one most worth disagreeing with.                                                   | `packages/config/src/guidelines.ts` → `COMMUNITY_GUIDELINES`, live at `/guidelines` |
| D   | **Profile prompts** — 8. Load-bearing: Decision #14 makes a connect a reply to one, so without them nobody can be reached.                                             | `packages/config/src/draft-copy.ts` → `PROFILE_PROMPTS`                             |
| E   | **Privacy policy** — 14 sections. Also needs counsel (Decision #30).                                                                                                   | `packages/config/src/legal.ts`, live at `/privacy`                                  |
| F   | **Terms of service** — 9 sections. Needs counsel too. Takes two unusual positions on purpose: verification is identity not character, and there is no content licence. | `packages/config/src/terms.ts`, live at `/terms`                                    |
| G   | **How-it-works and pricing prose.** Quotes §3.4 for the mechanics; the connecting text is mine.                                                                        | `packages/config/src/marketing.ts`                                                  |

Everything in `DRAFT_COPY` is mine too — headings, labels, button text. Lower
stakes, same status. The 2026-08-15 hardening pass added a few more: `bioHint`,
`inviteCopyFailed`, `voiceNoteAria`, `promptRemoveLabel`, `saveLabel`, and the
bio editor's screen.

`blockConfirm` is wired as of 2026-08-19 — block sits one row from Report in the
chat menu with no undo from the chat, so a mis-tap silently removed somebody.
Nothing in it asks why, which was the original argument. `KNOWINGLY_UNUSED` in
`copy-is-wired.test.ts` is empty for the first time. The two new strings beside
it, `blockConfirmLabel` and `blockKeepLabel`, are mine.

Also mine, added 2026-08-19: `chatMenuLabel`, `proposeToggleLabel`,
`chatOriginNote`, `browseTalking`, `browsePast`, `inboxChatsHeading`,
`inboxSentHeading`, `inboxClosedHeading`, `inboxClosedCount`, and the
`"Today"`/`"Yesterday"` day dividers inside `packages/logic/src/chat`.

### Held placeholders

Nothing below blocks Milestone 2 except where noted.
(The database password was supplied and the schema is applied — **rotate it**, it was
sent in chat. It is in no file in this repo; `pnpm check:db` reads `SUPABASE_DB_URL`
from the environment.)

| #   | Held                                                                                                                                                                                                                                                                                                                                 | Blocks        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| 1   | **Privacy contact address.** The policy commits to rights with response clocks and has no route for making a request. Domain secured 2026-08-17 as loveplusone.app; `privacy@loveplusone.app` is the intended alias. Note Resend only _sends_ — receiving needs mail hosting or a forwarding rule.                                   | **launch**    |
| 2   | **Data export (§9.4).** Unbuilt, and second in the §10 cut order. The policy sentence is removed until it ships; a test keeps it out.                                                                                                                                                                                                | fast-follow   |
| 3   | **Five room display titles.** §5.2 locks the slugs, not the titles. Slug-derived placeholders sit in `20260813000800_seed.sql`, flagged inline. Still the only user-facing strings in the build not taken from the spec verbatim.                                                                                                    | Milestone 5   |
| 4   | **Stripe keys** — secret, webhook secret, and the three price IDs.                                                                                                                                                                                                                                                                   | Milestone 6   |
| 5   | **Resend API key.**                                                                                                                                                                                                                                                                                                                  | Milestone 7   |
| 6   | **Liveness provider choice**, and its credential. Deferred 2026-08-14; running on `stub`. Recommendation is AWS Rekognition Face Liveness — see the spec correction above.                                                                                                                                                           | before launch |
| 7   | **Decline cooldown length.** 30 days, and the number is Claude's guess, not Kevin's. Long enough to be a real answer, short enough not to be a permanent ban on someone who simply was not ready. `COOLDOWNS.declineDays` and `app_config` key `cooldowns.decline_days` — tunable from the config editor without a migration. | fast-follow   |
| 8   | **Blocked-thread retention — 90 days.** Claude's recommendation, not Kevin's decision. Both open questions closed 2026-08-19: the blocked member keeps nothing, and 90 days is the window. An open report holds a thread past it; a resolved one holds it 90 days from RESOLUTION, so a slow queue cannot destroy its own evidence. `RETENTION.blockedThreadDays`, `app_config` key `retention.blocked_thread_days`. Built — the number wants confirming. | confirm       |

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
