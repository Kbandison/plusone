# Backlog

What "keep going" means, per lane, so two sessions do not converge on the same
task. On 2026-08-25 both independently built a handoff file within minutes of
each other; one was thrown away. That is what this prevents.

**Take the top unclaimed item in your lane.** Claim it in `HANDOFF.md` under
_Touching_ before you start, not after. If your lane is empty, say so rather
than wandering into the other one.

`git log` is what happened. `PROJECT_UPDATES.md` is why. `HANDOFF.md` is where
each session is standing. This is what is left.

---

## Lane: shells (macOS session)

Needs Xcode, a Simulator, or a Play Console. Nobody else can do these.

1. ~~**A grey band under the status bar**~~ — done 2026-08-26, and it needed
   the native tweak this entry guessed at rather than the decision to follow the
   system. `PlusOneShell` in `apps/ios` sets `overrideUserInterfaceStyle` on the
   window; `status-bar-style.tsx` calls it beside `SystemBars` off the same
   `data-theme`. Measured both ways: dark phone with Linen went from a drift of
   100 to about 1, and the mirror — light phone with Dusk — has no band either,
   which is the thing a pinned style could easily have traded for.

   Still latent, as it always was: nothing writes `plusone.theme`, so the two
   can only disagree if the key is set by hand. Fixed now so the toggle ships
   into something already correct.

2. ~~**Native push on iOS**~~ — done and verified on hardware 2026-08-26. A
   notification sent from a laptop arrived on an iPad running the TestFlight
   build; the same send reached an Android over web push. Registration, token
   storage, the settings state and delivery are all confirmed.

3. ~~**The native branch in `push-toggle`**~~ — done 2026-08-26. It reads
   iOS's own permission state and offers on, off or blocked, and it is the only
   place this app asks for notification permission. Asking on load spends the
   one prompt iOS ever shows before the member has expressed any interest.

4. ~~**The badge through the plugin**~~ — done 2026-08-26, and it counts.
   Kevin settled the §8 question (his item 10) in favour of a number, so
   `PlusOneShell.setBadge` carries it into the iOS shell, where WKWebView has no
   Badging API at all. The web and the TWA pass the same count to
   `navigator.setAppBadge`. Reasoning and what it trades are in
   `PROJECT_UPDATES.md`; the bucketed middle option is one line if it is ever
   revisited.
5. **Moved to the server lane.** The Android TWA was here because this lane is
   "Xcode, a Simulator, **or a Play Console**" — but nothing about it needs this
   Mac, and everything genuinely Mac-only is queued behind it. See server lane 10.

6. **Wire `inTwa()`.** It exists, is tested, and is used nowhere — a TWA has no
   `window.Capacitor`, so `inNativeShell()` and `nativePlatform()` both answer
   no inside a shipped Play app. Wire it when there is a TWA to watch it in, not
   before.
7. **A release Xcode.** `apps/ios` is driven by 27 beta 6 through
   `DEVELOPER_DIR`. Fine for the Simulator, not for a submission build.
8. ~~**A registered device, and the first TestFlight build**~~ — done
   2026-08-26. Kevin's iPad Pro is registered, Developer Mode is on, and
   version 1.0 (1) is uploaded and processing. Signed `Apple Distribution:
LuxWeb Studio LLC`, `aps-environment = production`, privacy manifest inside
   the bundle. The commands are in `apps/ios/README.md`.

   Three things gated it and none were obvious: an App Store archive still
   needs a registered device, because automatic signing builds a development
   profile first whatever you are archiving for; `xcodebuild` uses registered
   devices but never registers one; and the device needs Developer Mode, which
   only appears after a Mac running Xcode has connected to it.

9. ~~**A privacy manifest for the App target**~~ — done 2026-08-26.
   `PrivacyInfo.xcprivacy` declares eleven data types, tracking false, and no
   required-reason APIs (the app target's own Swift is the untouched Capacitor
   template and uses none; Capacitor's frameworks carry their own manifests,
   both empty). Wired into the Resources build phase by hand and verified
   present inside the built `.app` — Xcode does not add a file that merely
   exists on disk, and a manifest outside the bundle is a file nobody reads.
   Checked against `privacy-labels.ts` in both directions by a test.

10. ~~**Universal links**~~ — both halves done 2026-08-26. The association file
    has been serving since `c19268e` and the Associated Domains entitlement
    landed in `bf01efd`, along with the bit nobody warns you about: Capacitor
    posts a notification for a tapped link that **nothing in core listens to**,
    so without a handler the app opens on whatever page it last had and the link
    is simply lost.

    The apex is deliberately unclaimed — it answers 308 and iOS does not follow
    redirects when it fetches the file. Same trap as the TWA.

    **Confirmed on hardware 2026-08-26**: Kevin tapped a link from Notes on the
    iPad and it opened the app rather than Safari. It took build **1.0 (4)** to
    do it — the entitlement is read out of the app, so the build that was on the
    iPad could never have claimed anything however often it was reinstalled.
    That is the trap worth keeping: a missing entitlement is not fixed by a
    reinstall, only by a new build.

11. ~~**StoreKit**~~ — **done and proven on hardware 2026-08-26.** Landed
    2026-08-26: `PlusOneStoreKitPlugin` in `apps/ios`, registered by
    `MainViewController`, wrapped for the page by `apps/web/src/lib/native-iap.ts`.
    Verified in the Simulator against the real App Store Connect record —
    products resolve live (`6months` → $69.99, matching `PLANS`), entitlements
    and unfinished transactions resolve empty, a purchase with no product id
    rejects.

    **The server side landed 2026-08-26** (`90dfa60`):
    `submitAppStoreTransaction(jws)` in `settings/premium/iap-actions.ts`
    verifies Apple's signature against a chain ending at the embedded Apple Root
    CA - G3 and writes `iap_entitlements`. Return it `{ ok: true }` before
    calling `finishNativeTransaction` and never before — an unfinished
    transaction is what StoreKit redelivers when a grant does not land, and
    `submitAppStoreTransactions(jwsList)` takes the launch pass over
    `nativeUnfinishedTransactions()`.

    **The signature to call**, so it does not have to be asked for again:

    ```ts
    // apps/web/src/app/app/settings/premium/iap-actions.ts   ("use server")
    submitAppStoreTransaction(jws: string): Promise<IapResult>
    submitAppStoreTransactions(jwsList: string[]): Promise<IapResult[]>

    type IapResult =
      | { ok: true; premium: boolean }
      | { ok: false; reason: "unverified" | "not_yours" | "unbound" | "failed" }
    ```

    Send only `transaction.jws`; nothing else is read. **`ok: true` means finish
    the transaction whatever `premium` says** — a genuine but spent one returns
    `premium: false` and still has to be finished, or StoreKit offers it
    forever. `premium` decides what to draw, not whether to finish.
    `"not_yours"` is a second Plus One account restoring one Apple ID's
    purchase: do not retry and do not finish. `"unverified"` and `"failed"` must
    not finish either — redelivery is the recovery, and
    `submitAppStoreTransactions` is the launch pass.

    **A restore is not the launch pass, and the difference decides whether to
    finish.** `nativeUnfinishedTransactions()` returns purchases StoreKit is
    redelivering because nothing finished them, and those get finished on
    `ok: true`. `nativeEntitlements()` returns what Apple currently considers
    bought, and those are ALREADY finished — submit them to grant, then stop.
    Calling `finishNativeTransaction` on one finds nothing, `native-iap.ts`
    swallows the rejection and returns `false`, and code that reads that as
    failure reports an error on a restore that worked.

    Two answers to expect the first time restore is tested: a restore on a
    SECOND Plus One account returns `"not_yours"`, which is the subscription
    staying where it was bought rather than a bug; and any Sandbox purchase made
    without `appAccountToken` returns `"unbound"` forever, because nothing binds
    it — the only fix is to buy again with the token.

    **The screen calls it as of `4d256ad`.** `native-purchase.tsx` sells the
    three plans through Apple, restores, and the recovery pass in
    `native-iap-recovery.tsx` collects renewals and any grant that did not land.
    **A purchase was put through on 2026-08-26 and it works — nothing charged.**
    Apple's sheet, the signed transaction, the server verifying it against
    Apple's root, the entitlement written, the transaction finished. The paid
    tier is reachable in the shell through the only door Apple permits, which
    was the last piece of the 3.1.1 story.

    Two things for whoever wires it. The **reverse double-subscription guard**
    lives here rather than in the server lane: somebody with a live Stripe
    subscription must not be sold an App Store one, and the check belongs beside
    the button. And **`manage-store.tsx` is meant to be visible in the shell**,
    unlike checkout and the billing portal — Apple requires an IAP subscription
    be managed through their own screen. Nobody has watched it render.

    **`manage-store.tsx`, half checked.** The part that mattered most is
    confirmed: an off-origin `target="_blank"` link is handed to the system and
    does NOT navigate the web view, measured in the Simulator with the exact
    anchor that component renders. What could not be checked is the component
    rendering in place, because that needs a signed-in member with a live
    `iap_entitlements` row and the shell could not be driven to a signed-in
    state — see the proxy note in `HANDOFF.md`.

    **Also unchecked, and it is a regression risk in deployed code**: `30f26a2`
    changed Manage billing's condition from `subscription` to `stripeIsLive`. A
    member with a live Stripe subscription should still see it on the web and
    still not see it in the shell. The shell half is pinned by test; the web
    half wants a member who is actually paying Stripe, and inventing one in the
    production database to watch a button render is a worse idea than the bug.

    Three traps are already paid for and pinned by `shell.test.ts`; the commit
    body for `85315e8` has them in full. The short version is that all three
    fail silently, including a call to an unregistered plugin, which never
    settles rather than rejecting.

12. **Verification debt.** What is left of it is **the camera** — the liveness
    gate, which needs real hardware and now has some, so it is doable rather
    than blocked.

    Cleared 2026-08-26: the tapped universal link, confirmed by Kevin on the
    iPad against build 1.0 (4) — it opens the app instead of Safari. And the
    keyboard against the fixed composer, measured in the Simulator; what that
    turned up is item 13 and the fix in `69097b3`. Dusk, the offline page and
    both bottom sheets were cleared on 2026-08-25; what Dusk turned up is item 1.

13. ~~**The web view does not come back after the keyboard closes**~~ — does
    NOT reproduce on hardware, checked 2026-08-26. Kevin typed on the rooms page
    on the iPad and the bottom nav was still there afterwards.

    So the Simulator measurement was an artifact of the Xcode 27 beta runtime
    and a keyboard dismissed by script rather than by a person. Kept here rather
    than deleted because the decision not to fix it is the part worth
    remembering: it was written up with its numbers and its caveats and left
    alone pending a device, and a workaround built on those numbers would have
    touched safe-area layout to cure nothing.

## Lane: server and schema (WSL session)

Needs no Apple or Google account, and touches nothing under `apps/ios`.

1. ~~**`apnsNotifier()`**~~ — done, and verified end to end on 2026-08-26.

   **`fcmNotifier()` stays on the list. Kevin's call, 2026-08-26**, against a
   recommendation to drop it: he may still convert Android to Capacitor, and
   that is the one change that makes FCM necessary.

   Not needed today, and worth knowing why before anyone builds it: Android is
   a TWA, a TWA registers an ORDINARY WEB PUSH SUBSCRIPTION — `native-shell.ts`
   says so, and it is why `push_subscriptions.platform` stays `'web'` for one —
   and web push was seen reaching an Android on 2026-08-26. So this is work that
   buys nothing until the shell changes, and everything the moment it does. The
   column already accepts `'android'`; nothing is blocked by leaving it unwritten
   until then.

2. ~~**`pnpm push:test` cannot reach an iOS device**~~ — done 2026-08-26, and
   it sends through the same wire the app uses rather than a second copy. The
   split it needed is in `apps/web/src/lib/apns-transport.ts`.

   To use it locally the four public `APNS_` values plus the .p8 have to be in
   `.env.local`; `vercel env pull` brings three of them and refuses
   `APNS_PRIVATE_KEY`, which is Sensitive on purpose. Take that one off the .p8
   file, newlines escaped as `\n`.

3. ~~**`iap_entitlements`, and a third `exists` in `is_premium()`**~~ — done
   and applied 2026-08-26. Keyed on `store` + `transaction_id`, which is the
   store's handle for the SUBSCRIPTION and never for a payment. `revoked`
   grants nothing regardless of the date, which a clock comparison alone
   gets wrong. Covered by `check:premium`. Originally: the gate
   already unions `subscriptions` with `premium_grants`, so a third source
   changes nothing downstream. **Unblocked 2026-08-26** — the products exist in
   App Store Connect and their real ids are recorded on `PLANS` as
   `appleProductId`: `1month`, `3months`, `6months`. Key on those, not on
   `PlanId`; they are not derivable from it and a helper that builds one by
   string manipulation finds nothing at purchase time. They still cannot be
   submitted for review until there is an app version with a build to attach
   them to — that is Apple's rule, not a setup problem.
4. **Store webhooks — Apple's half is done**, 2026-08-26.
   `/api/app-store/notifications` verifies the envelope and the transaction
   nested inside it, and updates `iap_entitlements`. **Kevin has to point Apple
   at it**: App Store Connect → the app → General → App Information → App Store
   Server Notifications, Production and Sandbox URLs entered separately, both
   `https://www.loveplusone.app/api/app-store/notifications`. The "send test
   notification" button is the check, and `TEST` is deliberately accepted.

   **This now has a live test attached and a deadline.** Kevin's real sandbox
   purchase on 2026-08-26 wrote the first `iap_entitlements` row, and the row
   expires roughly 24 HOURS after it was made — the sandbox compresses the term,
   and the tester's renewal rate is an App Store Connect setting no session can
   see. Whatever the rate, that row renews or expires within about a day, and
   BOTH are notifications.

   So: with the URL set, the row updates itself and the whole path is proven
   including the half nobody has watched. Without it, the row goes stale, Kevin
   silently stops being premium, and the renewal that should have restored him
   never arrives. Nothing in the app will look broken — `is_premium()` will
   simply start answering no. Check `updated_at <> created_at` on that row to
   tell the two outcomes apart.

   **Play RTDN is still open and is blocked**, on something nobody has asked
   Kevin for yet: a Google Cloud service account with Pub/Sub, and Play Console
   pointed at a topic. RTDN carries only a purchase token, so unlike Apple's the
   payload is not self-describing — it has to be exchanged with the Play
   Developer API, which is what the service account is for. Worth doing only
   after there is an Android purchase to notify about, which needs the Play
   billing flow that server 12 records the shape of.

5. ~~**Cancellation routing**~~ — done 2026-08-26. The premium page reads
   `iap_entitlements` and routes each live source to where it can actually be
   cancelled: Stripe to the portal, Apple to `apps.apple.com/account/subscriptions`
   (which opens Settings on an iPhone), Play to its own screen with `sku` and
   `package`, without which it lands on every subscription the member has across
   every app. The store link is deliberately NOT hidden in the shell, unlike the
   portal — Apple requires an IAP subscription be managed through their screen.
6. ~~**The double-subscription guard**~~ — done 2026-08-26, in the action rather
   than only in the page, since a form rendered before subscribing and submitted
   after reaches `startCheckout` whatever the page drew. Still not keyed on
   `is_premium()`: a referral grant is no reason to refuse somebody a
   subscription. If two are ever live at once the page says so and offers both,
   rather than picking one and letting the other keep billing quietly.

   **What is left of it is the reverse trip and it needs shells 11:** somebody
   with a live Stripe subscription must not be sold an App Store one. The guard
   belongs beside the buy button, which does not exist yet.

7. ~~**Account binding**~~ — done 2026-08-26, both halves. Unique
   `(store, transaction_id)` refuses a second row and a trigger refuses an
   UPDATE that moves the owner; `record_iap_entitlement` (20260826000400) is the
   only thing that writes, and its update list does not contain `user_id`.

   The trigger had been doing real work rather than standing by, which was not
   the intent: PostgREST's upsert builds `on conflict do update set` from EVERY
   column in the payload, and the payload has to carry `user_id` for the INSERT
   — so every replay was proposing a rebind, and replay is the normal case
   because StoreKit redelivers until a transaction is finished. A comment in
   `iap-actions.ts` said "NOT user_id", which was true of the conflict target
   and false of the update set.

   A subscription already bound elsewhere now comes back null rather than
   raising, so a restore on a second Plus One account is told it is not theirs
   instead of getting a 500 and an unfinished transaction.

8. ~~**The Stripe path must not be reachable inside the shell**~~ — done by WSL
   in `e8eee7d`. Left here for the record:
   `settings/premium/actions.ts` creates a Checkout session, and offering that
   for a subscription inside an iOS app is guideline 3.1.1 — a hard rejection,
   against a store-billing decision already made on the 24th. Branch it on
   `inNativeShell()`. Small, and independent of items 2–4, so it does not wait
   on App Store Connect.
9. ~~**`/.well-known/apple-app-site-association`**~~ — done, and serving 200 as `application/json` through no redirect. The entitlement half landed in `bf01efd`.
10. ~~**The Android TWA**~~ — built and **uploaded 2026-08-26**.
    `apps/android/app-release-bundle.aab`, Bubblewrap against the manifest,
    signed with the upload key at `~/keys/plusone-upload.jks` (outside every
    checkout; `*.jks` is ignored repo-wide). `assetlinks.json` is done and
    serving. The fingerprint in it is Play's **app signing** key, not the upload
    key, and the two disagreeing is the correct state — Google re-signs every
    upload and the phone only ever sees theirs.

    Build it against **`www.loveplusone.app`**, not the apex. Chrome does not
    follow redirects when it fetches assetlinks, and the apex answers 308 — so a
    TWA pointed there fails verification and keeps its address bar, with nothing
    logged anywhere. Same origin trap that ejected the iOS shell into Safari.

11. ~~**The canonical origin**~~ — settled 2026-08-25. **www**, and both
    `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_APP_URL` now point at it in Vercel
    and in `.env.example`. `app.loveplusone.app` was never attached to the
    project and is out of the iOS allowlist too. Takes effect on the next
    deploy — until then the live build still carries the old values.

12. ~~**Play sells three subscriptions, not one with three base plans.**~~ —
    settled and recorded 2026-08-26. The three drafts exist and their ids are
    on `PLANS` as `playProductId`: `1month`, `3months`, `6months`, the same
    strings as Apple's by Kevin's choice. **Still to confirm in the console:
    each base plan must be flagged _backwards compatible_ or `getDetails()`
    returns nothing for that product** — no error, an empty list. Kept below
    because the reasoning is what stops somebody rebuilding it as one
    subscription. Found
    2026-08-26, before any billing code was written, and it inverts the advice
    that produced the current console setup — mine, and wrong.

    A TWA cannot address a base plan. The Digital Goods API's `getDetails()`
    takes subscription **product** ids; querying a base plan id returns an empty
    list, and a `PaymentRequest` naming one comes back `RESULT_CANCELED`. Play
    hands back whichever base plan is flagged _backwards compatible_ and there
    is no way to ask for another. So one `premium` subscription carrying 1mo,
    3mo and 6mo can only ever sell one of them on Android, and the other two are
    invisible rather than broken — no error, no log, just a screen that offers
    a single price.

    Three separate subscription products, one base plan each, each flagged
    backwards compatible. GoogleChromeLabs/bubblewrap#830 is open since Oct 2023
    with no fix; the Chrome and ChromeOS billing guides never mention base plans
    at all, and the DGA reference describes item ids as product ids throughout.

    **Correction, same day.** I first wrote here that three products meant no
    in-app tier change and that switching was cancel-then-resubscribe. That is
    wrong, and the right answer is better: the PaymentRequest `data` object
    takes `oldSku` and `purchaseToken` for the subscription being replaced,
    alongside the new `sku`, and Play performs a real cross-product replacement.
    Nobody has to cancel anything, and the three-product shape costs nothing
    here. What the DGA does not expose is the base plan, and only that.

    One consequence, plus the mode to use:

    - **The replacement mode is a product decision, not a default.**
      `withTimeProration` is what you get if you say nothing: the switch happens
      at once and unused time is credited by pushing the renewal date out. For
      an UPGRADE that is right. For a DOWNGRADE — 6 months to 1 month — it is
      not, because it takes effect immediately against money already paid; use
      `deferred`, which switches at renewal and leaves the paid term alone.
      Field renamed in android-browser-helper billing-1.1.0: `replacementMode`,
      with `prorationMode` deprecated but still honoured, and the values renamed
      with it (`chargeProratedPrice`, not `immediateAndChargeProratedPrice`).
      The ChromeOS guide still documents the old pair, so it will read as though
      it disagrees.
    - **Whatever ids Kevin creates are the ids forever.** A Play product id
      cannot be reused after deletion, exactly like Apple's. Record them on
      `PLANS` beside `appleProductId` — a _separate_ field, even if the strings
      end up identical, because two stores that happen to agree today are still
      two stores.

13. **The Play purchase flow, which is on no list until now.** Server 12 records
    WHY three products and 10 records the TWA that would run them, but nothing
    said who builds the buying. It is web-side — a TWA runs `apps/web` in real
    Chrome — so it is this lane, not the shells one.

    **Blocked on Kevin 15, the same service account as RTDN**, and the reason is
    worth stating because it differs from Apple's: a Play purchase hands back an
    opaque `purchaseToken`, not a signed statement. There is nothing to verify
    offline. It has to be exchanged with the Play Developer API, which is what
    the service account is for. So unlike `submitAppStoreTransaction`, the
    server half cannot be written first and cannot be written at all yet.

    What it will be, once unblocked: `getDigitalGoodsService`,
    `getDetails([...playProductId])` for live per-storefront prices, a
    `PaymentRequest` against `https://play.google.com/billing`, and a server
    action mirroring the Apple one — verify, then write `iap_entitlements` with
    `store: 'google'` through `record_iap_entitlement`, which already takes it.

    Do NOT ship the client half alone. macOS made the same call on iOS and was
    right: a button that takes money and grants nothing is worse than a paid
    tier that is unreachable.

## Lane: Kevin

Nothing else can proceed on some of these, so they are roughly in the order they
unblock other work.

1. **Counsel review of the privacy policy and terms** (Decision #30). The last
   item on `verify-launch`'s by-hand list; the other six are done. Both
   documents are marked DRAFT and the terms still say governed by "the law of
   the place we are established" with no jurisdiction named. Long pole — worth
   starting before it is the only thing left.
2. ~~**The signing key's SHA-256**~~ — supplied 2026-08-25 and serving. Note
   the Play record was recreated, so the first fingerprint is dead; the live one
   is in the route and pinned by a test that refuses the old one.
3. ~~**The Apple Developer Team ID**~~ — `JUR426AHDD`, set 2026-08-25 through
   Xcode's Signing tab, which is the right way round: writing the value by hand
   does not create a provisioning profile and automatic signing does. Device
   builds still need a registered device; App Store distribution does not.
4. ~~**App Store Connect**~~ — app record, the three subscription products and
   privacy labels all done 2026-08-26. The products cannot be submitted until
   there is an app version with a build; Apple reviews subscriptions alongside a
   version, never alone. Label answers live in `privacy-labels.ts`. Unblocks server lane items 2–4. The label answers are worked out and
   kept honest in `packages/config/src/privacy-labels.ts` — copy them from
   there rather than deciding again. One question in it is held for counsel:
   whether the liveness check counts as collecting biometric data when nothing
   is retained.
5. ~~**Whether a remote-URL shell is submittable**~~ — decided 2026-08-26:
   **yes, and we submit once StoreKit is in.** Not a gamble on 4.2 so much as a
   recognition that store billing is required for these subscriptions anyway —
   so the work that makes the strongest 4.2 case is work that has to happen
   regardless. Submitting before it would also trip 3.1.1, which is a far more
   certain rejection than 4.2 ever was.

6. **Supabase's Site URL is still `http://localhost:3000`.** An emailed
   sign-in link therefore lands on localhost. The app is fine —
   `/auth/callback` handles both link shapes. Dashboard → Authentication →
   URL Configuration: Site URL to `https://www.loveplusone.app`, and add
   `https://www.loveplusone.app/auth/callback` to Redirect URLs. The second
   half matters on its own — `settings/actions.ts` passes an explicit
   `emailRedirectTo`, and Supabase falls back to Site URL without a word
   when the target is not allow-listed, so adding an email address in
   Settings is broken the same way. Dashboard-only; there is no
   `config.toml`, so no session can do this from the repo.

7. **The app icon and launch image.** Both are placeholder geometry — Claude's,
   not a design. Replacing the SVG in `scripts/generate-icons.mjs` replaces
   every surface at once, web and iOS.
8. ~~**A Resend-verified sending domain**~~ — done 2026-08-25.
   `loveplusone.app` is verified and `RESEND_FROM` is set in Production to
   `Plus One <support@loveplusone.app>` — an address that can actually receive,
   since the domain carries Google Workspace MX. Email goes live on the next
   deploy for anyone who has switched it on; no event defaults to it.
9. ~~**Whether any event should default to email**~~ — decided 2026-08-26:
   **none does.** Email stays opt-in per event. Recorded in `notifications.ts`
   with the reasoning and held by `notification-defaults.test.ts`, because
   adding `"email"` to a row is a one-word change nothing else would question.
10. ~~**Small Business Program approval**~~ — applied 2026-08-26, processing
    email received. The rate moves from 30% to 15% fifteen days after approval.
    Note for the next person: the enrolment form fails in Safari with a generic
    "unknown error" and goes through in Chrome.

11. ~~**Whether the badge should count rather than mark**~~ — decided
    2026-08-26: **count**. Against the argument in `app-badge.tsx`, which is
    left in place rather than deleted so the trade stays legible, and beside a
    note saying the bucketed middle option is one line.
12. **`wsl --update`**, then re-run `--set-sparse true` and `fstrim`. Reclaims
    ~190 GB the disk image is holding. Tidying, not urgent.

13. ~~**Rebuild the Play subscription as three products**~~ — done
    2026-08-26. Three separate subscriptions in Play Console, one base plan
    each, ids matching Apple's: `1month`, `3months`, `6months`. Confirmed by
    Kevin.

    **Backwards compatible on all three, re-confirmed 2026-08-26** after the
    rebuild — which was a separate check from the earlier one, because the
    rebuild made new base plans and the flag does not follow. Without it
    `getDetails()` returns an EMPTY LIST for that product rather than an error,
    which reads as a pricing screen that simply has nothing on it.
    Originally: three products, one base plan each,
    each flagged **backwards compatible** — see server lane 12 for why a TWA
    cannot reach the other base plans. `premium` with `premium1month`,
    `premium3month` and `premium6month` inside it can only sell one price.

    Do this before the base plans are activated. A draft base plan can be
    deleted; an activated one holds its id inside that subscription forever, and
    a deleted subscription id can never be reused — same rule as Apple's.

    Whatever the three product ids end up as, send them over and they go on
    `PLANS` beside `appleProductId`. Matching Apple's `1month` / `3months` /
    `6months` is fine and makes a log line unambiguous; a leading digit is
    accepted, and the console rejects a bad id immediately rather than later.
    They still get their own field either way.

14. ~~**A Sandbox tester**~~ — done 2026-08-26, and a purchase went through with nothing charged. Unblocked the last of shells 11.

15. **A Google Cloud service account for Play RTDN.** Server lane 4's remaining
    half — Play's Real-time Developer Notifications — needs one, and nobody had
    asked for it, so WSL's lane is empty waiting on a thing that was not on any
    list. In Google Cloud console: a service account with the Pub/Sub Subscriber
    role, its JSON key, and the Play Console pointed at a Pub/Sub topic.

    Not urgent in the way the Apple side is: the App Store half of the webhook
    work is unblocked and Android cannot sell anything until the three Play
    products are rebuilt (item 12 above). Worth doing in the same sitting as
    that, since both are Play Console work.

    **No separate Google account.** The LuxWeb account that owns the Play
    Console is the one to use — a "service account" is a robot identity inside a
    Google Cloud PROJECT, not a person's login. An existing project is fine;
    Google's own doc says so.

    **NO DOWNLOADED KEY. Kevin's call 2026-08-26**, and it is the better one.
    Google now blocks key creation by default on new organisations
    (`iam.managed.disableServiceAccountKeyCreation`, part of Secure by Default),
    and rather than turn that off we federate: Vercel issues an OIDC token, GCP
    trusts it through Workload Identity Federation, and the function
    impersonates the service account with no long-lived credential anywhere. The
    org policy stays ON, there is no secret in Vercel, and nothing to rotate or
    leak. Vercel documents the GCP path at /docs/oidc/gcp.

    **A SECOND Secure by Default policy blocks the publisher grant.** Adding
    `google-play-developer-notifications@system.gserviceaccount.com` to the topic
    fails with `constraints/iam.allowedPolicyMemberDomains` — Domain Restricted
    Sharing, which by default permits only your own Workspace domain as an IAM
    principal, and Google's account is on `system.gserviceaccount.com`. Google's
    own Play docs anticipate this and its resource-manager docs list that exact
    service account as a worked example of an exception.

    The documented ways out, needing `roles/orgpolicy.policyAdmin`:
    set the constraint to not-enforced on the project, add the binding, restore
    enforcement — DRS is checked when a policy is WRITTEN, so the binding
    survives; or allow the principal permanently through the managed constraint
    `iam.managed.allowedPolicyMembers`, whose `allowedMemberSubjects` takes
    individual accounts where the legacy domain constraint takes only domains.
    **Policy changes take up to 15 minutes**, so an immediate retry proves
    nothing.

    **Two more steps fail silently, and one is wrong in Vercel's own guide:**

    - Vercel's walkthrough says to paste the pool principal into the **Service
      account users** field of the create-service-account wizard. That grants
      `roles/iam.serviceAccountUser`, which does NOT permit
      `generateAccessToken`. Impersonation needs
      **`roles/iam.workloadIdentityUser`** on the service account. Granted the
      wrong one, everything looks configured and token exchange 403s.
    - **`iamcredentials.googleapis.com` must be enabled** on the project or
      `generateAccessToken` fails with an auth error that does not mention the
      API.

    Five identifiers go into Vercel as ORDINARY env vars — project id, project
    number, service account email, pool id, provider id. None is a secret, which
    is the whole point.

    **The Vercel toggle is on the PROJECT, not the team**: project → Settings →
    Security → "Secure backend access with OIDC federation" → Team or Global →
    Save. Team mode is the stricter one and scopes the issuer to the slug.

    The values this account actually needs, read off `vercel project inspect`
    rather than guessed — the slug is not the display name:

    ```
    team slug        kevin-bandisons-projects
    vercel project   plusone-web
    issuer (Team)    https://oidc.vercel.com/kevin-bandisons-projects
    audience         https://vercel.com/kevin-bandisons-projects
    principal subject
      owner:kevin-bandisons-projects:project:plusone-web:environment:production
    ```

    **TWO service accounts are involved and they point in opposite directions.**
    This is the part the first version of this item missed, and missing it fails
    silently — the topic exists, the subscription exists, and nothing is ever
    published to it:

    - `google-play-developer-notifications@system.gserviceaccount.com` needs
      **Pub/Sub Publisher** on the topic. That is GOOGLE writing in. You do not
      create it; you grant to it.
    - The service account you create needs **Pub/Sub Subscriber** to read out,
      plus Play Developer API access to exchange a purchase token for the
      subscription state RTDN does not carry.

    The topic name goes in Play Console → the app → **Monetize → Monetization
    setup** → Real-time developer notifications, in the full form
    `projects/{project_id}/topics/{topic_name}`.

    **One choice is stickier than it looks.** RTDN may use a different project
    per app, but the Play Developer API must use the SAME project across every
    app on the developer account. If LuxWeb will ever ship a second app, that
    project is being chosen once for all of them.

---

## Done, so nobody re-opens it

The privacy policy audit (five claims corrected, three guards). Every mechanical
launch gate green against the live database. The email notifier and the
composite that lets providers run side by side. The iOS Capacitor target and the
safe-area fix for the nav and header. Both handoff mechanisms, reconciled to
one.

**The safe-area check, in full.** Both bottom sheets measured open in the shell
— `route-modal` pads 74px and holds "Send connect" 75pt clear of the home
indicator at the bottom of its scroll; `modal` pads 58px and clears by 59pt. The
engine reports the insets directly (top 62px, bottom 34px) and the nav's
computed `padding-bottom` is exactly the 34. Also cleared: Dusk renders and the
offline `errorPath` page renders. Driven through `ios-webkit-debug-proxy`, which
is how a WKWebView gets scripted when `simctl` cannot inject a tap — the reason
these sat open for two days.
