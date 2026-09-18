# App Review Information, and the reply to Guideline 4.3(b)

Two rounds live in this file. The 4.3(b) reply is first because it is the open
one; the 2.1 material below it is still what goes in the Notes field, and
section 3 has been rewritten because it is part of why 4.3(b) happened.

---

# Guideline 4.3(b) — Design — Spam · rejected 2026-09-16

Submission `58f0ff8f-340d-42c0-a795-6501f85b91b1`, 1.0 (106), reviewed on an
iPad Air (5th generation).

> The app primarily includes dating features that duplicate the content and
> functionality of similar apps that are already widely available… there are
> already enough of these apps on the App Store.

**This is a judgement about the concept, not a defect.** Nothing in the build is
wrong and there is nothing to fix and re-upload. 4.3(b) is the saturated-category
rule, and the two tells are in the letter: "reconsider the app concept", and the
suggestion to ship a web app instead.

**DO NOT RESUBMIT THE SAME BUILD.** The Extended Review paragraph is not
boilerplate decoration on a 4.3 — repeated submissions of the same thing buy
slower reviews and, at the far end, removal from the Developer Program. The next
move is a reply in Resolution Center, and then the App Review Board if that
fails. Not an upload.

## What we did to invite it

Section 3 of this file opened with **"Plus One is a dating app for people living
with HSV or HIV."** First five words. The rejection says "primarily includes
dating features."

In a saturated-category triage that sentence is the whole decision, and
everything that distinguishes the app came after it. It is also not the most
accurate description of what was built: `support_only` is an enforced mode, not
a preference — `browse/page.tsx` redirects and the dating surfaces leave the nav
— so a member can use this app with no dating in it at all.

Section 3 is rewritten below. That is the durable fix; the reply is the
immediate one.

## Do NOT argue traction, and this is measured rather than assumed

The tempting line is "look how much is happening in the rooms". Measured
2026-09-16, it does not survive being checked:

| room               | posts | ingested articles | authors |
| ------------------ | ----- | ----------------- | ------- |
| Latest news        | 124   | **123**           | 1       |
| Disclosure stories | 26    | 0                 | 6       |
| Newly diagnosed    | 6     | 1                 | 5       |
| General lounge     | 5     | 1                 | 4       |
| HSV general        | 5     | 1                 | 4       |
| U=U                | 5     | 0                 | 5       |

So "171 posts" is about forty-seven human ones, from a handful of authors, most
of them seeded or Kevin's own test accounts. Citing the number invites a
reviewer to go and look, and what they find is thin rooms and fabricated people.

**The case is STRUCTURAL.** What the app is built to do, and what it refuses to
do, are true today and checkable in two minutes. Traction is neither.

## Argue the right clause

The guideline says the app "duplicates the content and **functionality** of
similar apps". The first draft of this reply argued the app is not really a
dating app — which is the wrong argument and Kevin caught it: it overstates the
support half, it reads as somebody constructing a phrase to dodge a category,
and getting caught overstating is worse than the framing that caused the
rejection.

**4.3(b) does not forbid a dating app. It forbids an interchangeable one.** The
functionality here is not a duplicate, and that is checkable in two minutes:
no swipe, no like, three profiles a day that cannot be bought past, a
seven-day chat nobody can extend, a closing note nobody can buy out of, and a
paid tier that explicitly cannot buy rank. Lead with that.

## The category is NOT the problem

Social Networking, with Lifestyle as secondary — confirmed by Kevin
2026-09-16. That is honest and it does not invite the dating read, so there is
no lever here. Moving to Health & Fitness now would look like dodging the
rejection rather than describing the app.

## Leave the seeded accounts in

Raised as a liability and it was the wrong call, corrected by Kevin: a reviewer
with an empty app cannot exercise anything, and "we could not review your app"
is its own rejection — which is the whole of Kevin 22. Apple wants working test
data. 4.3 is about duplicate apps, not populated test accounts.

`check:seed` still gates the real launch, which is where removing them matters.

## The reply — paste into Resolution Center

**Written to sound like a person.** The first draft did not: "we would like to
give context", "differs structurally", "we would welcome a re-review". A
reviewer reads hundreds of these and that register is a tell. Short sentences,
contractions, no bold, and an admission first.

> We think this got reviewed as a general dating app, and that's partly our
> fault — our own review notes called it one. Here's what it actually is.
>
> Plus One is for people who have been diagnosed with HSV or HIV. The whole
> thing is built around disclosure. Everyone has already stated their status
> before they join, so nobody has to have that conversation with a stranger and
> nobody gets rejected for it afterwards. That is the problem it solves, and it
> isn't one the apps in this category solve.
>
> It's also not only for dating. There's a support-only mode in Profile —
> switch it on and the Browse tab disappears, the route redirects, and you stop
> appearing in anyone else's results. What's left is the community rooms:
> Newly diagnosed, Disclosure stories, U=U, HSV general, a general lounge, and a
> news feed scoped to your condition. Some members use it only that way.
>
> On the dating side, almost nothing works the way it does elsewhere:
>
> - No swipe and no like button. To reach someone you answer one of the prompts
>   on their profile.
> - Three profiles a day. The same three for everyone, and you can't pay for
>   more.
> - A chat lasts seven days unless both people agree a plan. Then it closes with
>   a note they both see. Nobody can extend it, and nobody can buy their way out
>   of the note.
> - Our subscription can't buy ranking, visibility, extra profiles or undo. We
>   kept all of that off the table on purpose.
> - Everyone passes a liveness check. Impersonation and screenshots are the
>   specific way people with these diagnoses get hurt.
>
> If it helps, signing in with the demo account and doing this takes about two
> minutes:
>
> 1. Tap Rooms, and open Newly diagnosed or Disclosure stories.
> 2. Go to Profile and switch on Support-only.
> 3. Browse disappears from the bottom bar. Going to it directly redirects.
>
> Happy to answer anything else.

## Section 3, and what Kevin's objection changed

v2 of section 3 opened "a peer-support and connection app". His read was that
this misrepresents the app as primarily support-only — the same mistake as the
original in the opposite direction, and a worse one to be caught at, because the
Notes field is permanent and a reviewer opening the app meets the Drop first.

Rewritten a third time rather than applied. The fix turned out to be the
sentence shape rather than the vocabulary, and the argument moved with it: see
section 3 below, and "Argue the right clause" above.

---

# The earlier round — Guideline 2.1, answered 2026-09-13

Apple asked for seven things on 2026-08-29 (Guideline 2.1 — Information Needed,
new app submission). **That was not a rejection of the app.** The binary was
accepted and entered review; a reviewer was asking for the App Review
Information that should have been in the Notes field.

Sections 3, 5, 6 and 7 below are ready to paste. Sections 1, 2 and 4 need Kevin,
and 4 is the one with a real blocker in it — read it before recording anything.

**Paste this into App Store Connect → App Review Information → Notes**, not only
into the reply. Apple says so explicitly, and it is what stops the next
submission asking again.

---

## 1. Screen recording — KEVIN, on the iPad

Apple wants one recording, on a physical device, on the latest OS, starting from
launch. It must show, because the app has all four:

- [ ] account registration, login, **and account deletion**
- [ ] the subscription flow — the three plans and Apple's purchase sheet
- [ ] user-generated content, **including reporting and blocking**
- [ ] every permission prompt: camera (liveness), location (radius),
      notifications

Deletion and the report/block flow are the two most often missed, and both exist
in this app. Settings → account deletion, and the report/block controls on a
profile and in a chat.

## 2. Devices and OS tested — KEVIN

Apple wants the list. What is known from the record:

- iPad Pro (Kevin's), builds 1.0 (1) through 1.0 (5) — the only physical device
  this app has ever run on.
- iPhone 17 Pro simulator, iOS 27.0, for the shell work.

**Say the truth, including that it is one device.** A short honest list is not a
rejection reason; a list that implies coverage nobody has is.

## 3. What the app does, and for whom — REWRITTEN TWICE

**This goes in the permanent Notes field**, not in a reply. Every reviewer on
every future submission reads it, which is why the second draft was thrown away
rather than shipped: a description that oversells the support half is a standing
claim, checked repeatedly by people who open the app and meet the Drop first.

Three versions and both of the discarded ones are instructive.

- **v1** opened "Plus One is a dating app for people living with HSV or HIV",
  and 4.3(b) came back saying "primarily includes dating features".
- **v2** opened "a peer-support and connection app". Kevin's read: that
  misrepresents the app as primarily support-only, which is the same error in
  the opposite direction and a worse one to be caught at.

**The real fault in v1 was the sentence SHAPE, not the word "dating".** It made
"dating app" the subject and "for people living with HSV or HIV" a trailing
prepositional phrase — skimmable, and skimmed. Put the population inside the
subject and it cannot be lifted out. That is a fix rather than spin: nothing
below is softer than v1, it is just ordered so the qualifier is load-bearing.

The second paragraph does the 4.3(b) work, because that is the question this app
keeps triggering and the Notes field is where a reviewer meets it first.

> Plus One is a dating and peer-support app for adults living with HSV or HIV.
>
> The problem it solves is disclosure. Every member has stated their status
> before joining, so nobody has to raise it with a stranger and nobody is
> rejected for it after the fact. That is not a problem the general dating
> category solves, and it is the reason the app exists.
>
> It has two halves. Most members use both; a member in **support-only** mode
> uses only the second. Support-only removes them from every dating surface —
> the Browse tab leaves the navigation, the route redirects, and they do not
> appear in anyone else's results.
>
> **Connection**: a nightly curated set of three profiles ("the Drop"), a
> browsable directory with filters, and one-to-one chats that open only on
> mutual consent.
>
> **Community**: moderated rooms — Newly diagnosed, Disclosure stories, U=U,
> HSV general, a general lounge — and a news feed scoped to the member's
> condition.
>
> The connection half is deliberately unlike the category:
>
> - No swipe and no like button. Reaching someone means writing an answer to one
>   of the prompts on their profile.
> - Three profiles a day, the same number for everyone, and not purchasable.
> - A chat lasts seven days unless both people agree a plan, then closes with a
>   note both people see. That timer cannot be extended or paused at any price.
> - The paid tier cannot buy ranking, visibility, extra profiles, undo, or an
>   exemption from the closing note.
>
> Every member is verified as a real person — a phone number and an automated
> liveness check — because impersonation and screenshot harassment are the
> specific harms this population faces.
>
> The audience is adults (18+) who have received an HSV or HIV diagnosis.

## 4. Setting up and accessing the app — KEVIN, AND READ THIS FIRST

**What a reviewer actually meets, on the build being submitted.** Checked in the
Simulator against 1.0 (202609020240), not inferred:

```
launch  ->  server.url is /app          (137d358; it was the marketing page before)
        ->  no session, so /app redirects to /onboarding/phone
        ->  the screen titled "Your number", step 1 of 10
```

So the reviewer does NOT see the home page and does NOT see the waitlist form.
They land on the first step of account creation — which is the one door the
closed beta refuses. WSL's earlier note described the web entry point correctly
and it stopped being the shell's the moment the start URL changed.

**They should still use Sign in, but not because signup is refused.** Signup
OPENED on 2026-09-13 (BACKLOG 22), so entering a number on that screen now
creates a real account — it works, it just is not the account you want reviewed.
The demo account already exists and is past onboarding and the liveness check,
which is what makes it worth pointing at. `aa6f434` puts "Already have an
account? Sign in" on that screen, and a shell has no address bar, so that link
is the only route there.

**This paragraph and the block below were rewritten after the 2026-09-13
resubmission.** The notes submitted with it said signup was invitation-only and
would be refused, which stopped being true the same day. A reviewer note
describing a gate that no longer exists is the same error as one describing a
screen that does not exist — the App Review Information → Notes field needs the
block below pasted over the old one, which does not require resubmitting.

**Paste this at the top of the reply and into the Notes field:**

```
The app opens on the "Your number" signup step.

Please do not create a new account. Tap "Sign in" on that same screen.

Clear the field first, then enter the number exactly as:  +1 800 555 0147
The field suggests a country code as you type, so entering the number with
its own leading 1 into a non-empty field produces the wrong number.

The verification code is the one in App Review Information. No SMS is sent
and nothing needs to arrive.

The account has already completed onboarding and the one-time identity check,
so signing in to it is the only way to reach the full app — a new account
would stop at those steps.
```

**THE PHONE NUMBER, NOT THE EMAIL. Corrected 2026-09-17 after a Beta App Review
rejection.** This block told the reviewer to sign in with an email address, and
the demo account's address is `18005550147@dev.invalid` — `.invalid` is a
reserved TLD that can never receive mail. The email route was never going to
work for anybody.

What DOES work is the phone number with Supabase's test-OTP pair, which was
verified end to end on 2026-08-27 and is live: requesting a code for
`+18005550147` answers `{"message_id":"test-otp"}`, meaning no SMS is sent and
the fixed code is accepted. Probed again 2026-09-17.

**The rejection was a doubled country code, and the app now prevents it.** The
reviewer was given `18005550147`, put it into the empty sign-in field, and the
field added the suggested `+1` in front — producing `+118005550147`, a different
number with no test pair behind it. An unconfirmed account row at that number,
created 14:13 on the 17th, was the receipt; it has been removed.

`applyDialCode` no longer doubles a code given without a plus, so the same paste
now yields `+18005550147`. The instruction above still says to clear the field,
because a reviewer should not be relying on us having got that right.

Naming the button is not politeness. `apps/android/README.md` records a round
trip lost to exactly this: "Get started" and "Sign in" are different doors and
only one of them works once the account exists. Its old sentence — "creating a
NEW account does require a one-time identity check" — is now actively wrong and
invites a reviewer to try something that is refused outright. It must not
survive into Apple's reply.

**Why email and not SMS.** Sign-in sends a one-time code, and a reviewer cannot
receive an SMS. This is the App Access problem BACKLOG Kevin 12 flagged on
2026-08-27 as the thing that "blocks submission on both stores rather than
delaying a listing, and wants solving before somebody is waiting on a review".

The way out was already built: `sign-in/actions.ts` accepts an email address as
well as a phone number, and `verifyOtp({ type: "email" })` takes a CODE typed
into the app rather than a magic link — so no SMS and no working redirect URL is
needed. The code length is a Supabase dashboard setting; the input is a ceiling
(`OTP.codeMaxLength`) and fits whatever it is set to.

**Kevin said "supabase is done" on 2026-09-01, and that is NOT the same as
checked.** Relayed through WSL, who flagged it as a relay rather than a
confirmation — correctly, because this is the one claim in this document that
the reply actively promises. What could be checked from a session was checked
and it does not reach the important half:

```
auth settings endpoint   exposes no template and no Site URL — not knowable here
auth.users               25 of 28 accounts carry a confirmed email
                         (counts only; an address in a log beside this app's
                         name is the disclosure §9.6 exists to prevent)
```

So an email on SOME account is plausible and an email on the REVIEWER'S account
is not established, and whether the template carries `{{ .Token }}` cannot be
read by any credential this repo holds. Neither can be taken from a message.

**One test settles both, and only Kevin can run it.** Sign out, enter the
reviewer's address on `/sign-in`, and finish signing in with the code that
arrives. If a six-or-eight digit code arrives and works, the account has an
email, the template carries the token, and the rate limit is not in the way — all
three, in about a minute. If a link arrives instead of a code, the template is
still the default and the reply must not go.

Do it before replying. A reviewer who gets a link pointing at
`http://localhost:3000` and a code screen with nothing to type files the same
2.1 again, and that would be the third round on one question.

**Two things must be true and BOTH are dashboard work, not code:**

1. **The reviewer account needs an email address on it.** Set it in Supabase →
   Authentication → Users, not through the app's Settings screen, which passes
   an `emailRedirectTo` that is not allow-listed yet (Kevin item 6).
2. **The Magic Link template must contain `{{ .Token }}`.** The default has only
   `{{ .ConfirmationURL }}`, which points at `http://localhost:3000` — so the
   reviewer would get a dead link and a code screen with nothing to type.
   `supabase/templates/magic-link.html` is the branded replacement and carries
   the token.

A third, learned the hard way: **Supabase's built-in mailer is rate-limited to a
couple of messages an hour and is not for production.** Point SMTP at Resend
(Project Settings → Authentication → SMTP Settings) and raise the limit, or a
reviewer who asks for a second code is told there have been too many.

**Send yourself a code at that address and sign in with it before replying.** The
reply is what promises this works, and an untested credential costs a review
cycle rather than a minute.

Kevin item 12 also records that **the liveness gate is not a barrier**: an
account already taken through onboarding is past it permanently.

## 5. External services — READY

> - Supabase — database, authentication (SMS and email one-time codes) and file
>   storage.
> - Vercel — application hosting.
> - Apple — App Store in-app purchases (StoreKit 2) and push notifications
>   (APNs). Subscriptions inside the iOS app are sold only through Apple.
> - Stripe — card payments on the website only. The Stripe path is deliberately
>   unreachable inside the iOS app, per guideline 3.1.1.
> - Resend — transactional email.
> - Twilio, through Supabase — SMS delivery for sign-in codes.
> - AWS Rekognition Face Liveness — the selfie liveness check at signup.
>
> No advertising SDK, no analytics SDK, and no third-party AI service.

**Kevin: confirm `LIVENESS_PROVIDER` in Vercel production before sending.** If
it is still `stub`, remove the AWS line — describing a vendor that is not wired
up is worse than a shorter list.

## 6. Regional differences — READY, CONFIRM

> The app functions identically in every region where it is available. There is
> no region-gated content, no regional feature differences and no regional
> pricing beyond the App Store's own currency conversion of the three
> subscription products.

**Kevin: confirm the App Store availability you actually selected.** If it is
United States only, say so — it is not a problem, and it contradicts nothing
above.

## 7. Regulated industry / protected material — READY

> Plus One is not a healthcare provider and is not a regulated medical service.
> It provides no diagnosis, no treatment, no testing and no medical advice, and
> it has no clinical relationship with any member. A member's stated condition
> is self-declared and is used only to group people who have already disclosed
> it to each other; it is never verified against medical records, never shared
> with third parties, and never used for advertising.
>
> The community rooms are peer support between members. Moderation is by the
> operator, with member reporting and blocking on every surface.
>
> No third-party protected material is used.

Answer 7 rather than skipping it. This app is health-ADJACENT and a reviewer who
has to guess will guess conservatively.

---

## Why this happened, so the next submission does not

The Notes field was empty. Everything above could have been written before the
first submission — none of it needed the review to happen first, and Apple's own
message says to put it in the Notes for future submissions.

The one genuinely new fact is in section 4: the sign-in OTP was recorded as a
predicted blocker on 2026-08-27 and became a real one the moment a human tried
to open the app.
