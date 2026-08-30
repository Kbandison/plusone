# App Review Information — the reply to Guideline 2.1

Apple asked for seven things on 2026-08-29 (Guideline 2.1 — Information Needed,
new app submission). **This is not a rejection of the app.** The binary was
accepted and entered review; a reviewer is asking for the App Review Information
that should have been in the Notes field.

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

## 3. What the app does, and for whom — READY

> Plus One is a dating app for people living with HSV or HIV. Its purpose is to
> remove the disclosure conversation from dating: every member has already
> stated their status to join, so nobody has to raise it with a stranger and
> nobody is rejected for it after the fact.
>
> Every member is verified as a real person — a phone number and a liveness
> selfie check — because the failure this community is most exposed to is
> catfishing and screenshot harassment.
>
> The core features are a nightly curated set of profiles ("the Drop"), a
> browsable directory with filters, one-to-one chats that open only on mutual
> consent, and moderated community rooms. Members may also choose a
> "support-only" mode, which removes them from all dating surfaces and leaves
> only the community rooms.
>
> The audience is adults (18+) who have received an HSV or HIV diagnosis. The
> problem it solves is that disclosure is the hardest part of dating with a
> stigmatised condition; the value is that it is already handled.

## 4. Setting up and accessing the app — KEVIN, AND READ THIS FIRST

**A reviewer cannot sign in with a phone number.** Sign-in sends a one-time code
by SMS to the member's own phone, and a reviewer has no way to receive it. This
is the App Access problem BACKLOG Kevin 12 flagged on 2026-08-27 as the thing
that "blocks submission on both stores rather than delaying a listing, and wants
solving before somebody is waiting on a review". Somebody is now waiting on a
review.

**The way out is email, and it is already built.** `sign-in/actions.ts` accepts
an email address as well as a phone number, and `verifyOtp({ type: "email" })`
takes a SIX-DIGIT CODE typed into the app — not a magic link. So a reviewer with
an email address on the account can sign in with no SMS and no working redirect
URL.

Two things have to be true and **neither has been checked**:

1. **The reviewer account needs an email address on it.** Adding one through
   Settings passes an explicit `emailRedirectTo`, and Supabase silently falls
   back to Site URL when the target is not allow-listed — which is Kevin item 6,
   still open. Setting the address directly in the Supabase dashboard avoids
   that path entirely.
2. **Supabase's email template must send the code, not just a link.** The
   default template contains `{{ .ConfirmationURL }}` and no `{{ .Token }}`. If
   the token is missing, the reviewer gets a link that points at
   `http://localhost:3000` (Kevin item 6 again) and the code screen has nothing
   to type. Dashboard → Authentication → Email Templates → Magic Link.

Kevin item 12 also records that **the liveness gate is not a barrier**: a
reviewer account already taken through onboarding is past it permanently.

Give Apple the email address and note that the code arrives by email.

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
