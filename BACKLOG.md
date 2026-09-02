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

   **Not once seen on a device.** iOS grants badge authorization as part of the
   notification permission, so this cannot be checked in a Simulator and the
   build on Kevin's iPad — 1.0 (4) — predates the plugin method entirely.

   **Corrected 2026-08-29: it is ONE thing waiting, not four.** This paragraph
   said "one of four iOS things now waiting on the same new build" and item 12
   had already closed three of them — onboarding confirmed on hardware, the
   status-bar band and the keyboard re-verified in the Simulator against the
   current tree. Only the badge is left, and only its last inch: the native
   method answers `{"count":7}`, so what is unseen is iOS drawing the number on
   the icon. A stale count reads as a bigger blocker than exists and argues for
   a build nobody needs.

5. **Moved to the server lane.** The Android TWA was here because this lane is
   "Xcode, a Simulator, **or a Play Console**" — but nothing about it needs this
   Mac, and everything genuinely Mac-only is queued behind it. See server lane 10.

6. ~~**Wire `inTwa()`**~~ — done 2026-08-27, when there was finally a TWA to
   watch it in. `plan-buttons.tsx` has three surfaces now, and the Android one
   could not be detected any other way: a TWA is real Chrome with no
   `window.Capacitor`, so every branch that trusted `inNativeShell()` was
   treating it as the web. Harmless until there was something to sell through
   Play, and Play's billing policy the moment there was.
7. ~~**A release Xcode**~~ — and then NOT the release one. Solved twice on
   2026-08-29, in opposite directions.

   `Xcode.app` 26.6 will not launch on macOS 27 beta, but its `xcodebuild`
   runs and every command here is `xcodebuild` — so the app never needs to
   open. Getting there needs `sudo ... xcodebuild -license accept` (until then
   every command answers with the licence text, including `-showsdks`) and
   `xcodebuild -downloadPlatform iOS`, 8.5 GB, during which `-showsdks` lists
   an SDK that builds insist is not installed.

   **Then Apple rejected the build it produced.** ITMS-90111: submissions must
   use the latest Xcode and SDK. Xcode 26.6 carries iOS 26.5; the beta carries
   iOS 27.0; no Xcode 27 RC exists. So the BETA is the submission toolchain for
   now — see `HANDOFF.md`, which has the full shape of it.

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

12. **Verification debt — two closed, one still needs a person.**

    Onboarding is fixed and confirmed on hardware: Kevin got through the radius
    step on 1.0 (5), which is what the location purpose string was for.

    **Re-verified in the Simulator against the current tree on 2026-08-29**,
    after the `MainViewController` split and `ShellPlugins` — because a fix
    verified before a refactor is not a fix verified after one:

    - ~~**The status-bar band**~~ — `rgb(239,233,223)` at every row to the top
      edge, which is Linen exactly. `PlusOneShell` registers,
      `setInterfaceStyle` and `setBadge` both answer.
    - ~~**The keyboard**~~ — safe-area inset `34 -> 0` with the keyboard up, the
      web view resizes, and the composer stays 44.6px clear.

    **Still unseen: the badge, and only its last inch.** The native method
    answers `{"count":7}`, so the plumbing is proven — what nobody has watched
    is iOS actually drawing the number on the icon, and that needs notification
    permission granted, which needs a tap no Simulator will accept from a
    script. Look at the home screen with unread notifications on 1.0 (5).

    **The camera**, the liveness gate, is now reachable for the first time —
    onboarding could not be finished in the shell before this build.

    One trap worth keeping, because it cost a false alarm today: an unanswered
    system permission dialogue DIMS the whole page, so a pixel sample taken
    while one is up reads as a grey band that is not there. The numbers said
    regression; the screenshot said stale dialogue. Reboot the simulator and
    look at the picture before believing a colour.

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
4. ~~**Store webhooks — both stores**~~ — **proven on real Apple traffic
   2026-08-27.** Kevin's sandbox subscription renewed and the notification
   arrived, verified and applied:

   ```
   22:19:44  POST /api/app-store/notifications  200
             {"at":"appstore.notify","type":"DID_RENEW","status":"active","rows":1}
   row       updated_at 22:19:45.063Z, one second later
             expires_at 2026-08-27T22:20:28Z -> 2026-08-28T22:20:28Z
   ```

   Both halves were needed to attribute it. The row moving is NOT proof on its
   own: `NativeIapRecovery` listens to StoreKit's update stream, so a renewal
   reaching a device with the app open would have written the same row through
   `record_iap_entitlement`. The log line is what says the webhook did it.

   Nothing was staged. A real purchase, a real Apple renewal, a real signature
   checked against the embedded root, and one row updated — which is the whole
   Apple payment path end to end, and the last part of it nobody had watched.

   **Play RTDN is done and proven too**, 2026-08-27, a few hours after this. The
   service account it was blocked on exists now and federates rather than
   holding a key. The queued test notification was delivered by push and
   answered 200:

   ```
   00:00:54  POST /api/play/notifications  200
             {"at":"play.notify","kind":"test"}
   ```

   One line, and it exercises the whole chain: Play publishing to the topic, the
   publisher grant that permits it, the push subscription, Google's OIDC token
   passing `verifyPushCaller`, the envelope decoding, and the acknowledgement. A
   401 in the same log four minutes later is a probe of mine, not Google.

   So BOTH stores' webhooks are now proven on real traffic — which was the half
   of the payment path nobody had watched on either side this morning.

   Two things the sandbox will do on its own, worth knowing before they look
   like bugs. It renews every ~24h at this tester's rate, so the row keeps
   moving without anybody touching it. And sandbox auto-renews **six times and
   then stops** — so around 2026-09-01 that subscription EXPIRES, which sends
   `EXPIRED` and exercises the other branch of `statusFromNotification` for
   free. If somebody notices Kevin has stopped being premium that day, this is
   why, and it is the system working.

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

    **Verified on a device 2026-08-27** — installed from the internal testing
    track, no address bar. That took one more fix than expected and it is the
    kind worth keeping.

    Build it against **`www.loveplusone.app`**, not the apex. Chrome does not
    follow redirects when it fetches assetlinks, and the apex answers 308 — so a
    TWA pointed there fails verification and keeps its address bar, with nothing
    logged anywhere. Same origin trap that ejected the iOS shell into Safari.

    **And `assetlinks.json` needs THREE fingerprints, not one.** This app is
    enrolled in quantum-ready hybrid signing, so Play signs with a classical key
    for pre-Android 17 devices and a new classical + ML-DSA-65 pair for Android
    17 and later — three distinct keys, all of which must be listed. The file
    carried only the post-quantum one for two days and a real phone showed the
    address bar, because it verified with a key that was not in the list. The
    reasoning and all three values are in the route's docblock; the test pins
    three and refuses both the upload key and the discarded record's.

    A certificate fingerprint IS the SHA-256 of its DER encoding, so the values
    were computed from Play's exported .der files with `sha256sum` and
    cross-checked with openssl rather than transcribed — worth knowing because
    openssl cannot parse ML-DSA-65 on every build and the raw hash always can.

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

13. **Play returns an empty catalogue. The bridge itself is fixed.**

    **`clientAppUnavailable` is GONE, 2026-08-27.** It is kept below because
    the elimination work is worth not repeating, but it is no longer the
    problem. What the app reports now:

    ```
    getDigitalGoodsService present: true
    referrer: android-app://app.loveplusone/
    ua: ... Android 10; K ... Chrome/151.0.0.0 Mobile Safari/537.36
    service resolved: yes
    getDetails returned 0 of 3 asked for
    listPurchases returned 0
    ```

    **`listPurchases` did not throw**, and that is the whole finding. It crosses
    the same DelegationService bridge as `getDetails`, so one of them answering
    proves the bind Chrome could not make now works. What cleared it is not
    known — a licence settling, a reinstall, or Play catching up — which is
    unsatisfying and worth saying rather than inventing a cause for. Asking both
    calls is what made it legible; a single throwing call had looked identical
    for three days.

    **The ids are right, so this is not spelling.** Read off the console
    2026-08-27: `premium1month`, `premium3months`, `premium6months`, one active
    base plan each, exactly what `PLANS` carries. An hour was spent doubting the
    plurals for nothing.

    **The control answered, and it narrows this a long way.** The diagnostic also
    asks for `plusonepremium`, the discarded first attempt, and Play returns it:

    ```
    Play knows: plusonepremium
    ```

    So Play answers this device, for this app, on this account — and does not
    know the three current ids. Everything shared by all four products is
    therefore fine: the bridge, the licence, catalogue access, the account. The
    fault is confined to the three new subscriptions.

    **And it is NOT the backwards-compatible flag**, which was the standing
    hypothesis and the one this repo warns about in two other places. Read off
    the console 2026-08-27, all three: base plan Active, **Backwards
    compatible**, 174 countries. The configuration is correct.

    All three read **last updated Aug 28, 2026** — changed within hours of being
    asked for, where `plusonepremium` is old. So the remaining difference is
    age, not configuration: propagation, or a stale catalogue on the device.

    ── 2026-08-29, and the cache theory is dead ───────────────────────────────

    **Re-read on the device at 18:18. Still 0, and the bridge is HEALTHY.**

    ```
    TWAProviderPicker: Found TWA provider: com.android.chrome
    TWAConnectionPool: Found app.loveplusone.DelegationService to handle request
    LicenseClient: License check succeeded.
    TwaBilling.DG: Calling getDetails for premium1month, premium3months, premium6months
    TwaBilling.DG: Connected to Play Billing library.
    TwaBilling.DG: GetDetails returned: 0        (twice, .789 and 55.388)
    Finsky: Billing preferred account via installer — hash unchanged
    ```

    No `clientAppUnavailable` anywhere in the launch. So every reading below
    that blamed the bridge was reading a transient, and the catalogue problem
    underneath it has not moved in two days.

    **This kills the standing hypothesis.** The entry above says to leave it
    overnight and re-read, on the theory that the Play Store cache wiped at
    ~22:00 on the 27th would refill. It has had two days and it has not.

    One new number, and it cuts the other way from the 27th's: the first
    `getDetails` took **152ms**, against 23ms then. 23ms with no network request
    was the evidence for "local cache lookup against an empty cache". 152ms is
    long enough to have asked, which would make this a live answer of zero
    rather than a stale one — and a live zero is a different problem, on Play's
    side of the line, about products it will not serve to this app.

    Not proof; a slow local path can also take 152ms. But it is the first
    reading that distinguishes the two hypotheses at all, and it points away
    from caching.

    **The premium screen renders the three plans anyway**, from `PLANS` in
    config, with working-looking Choose buttons and a Restore purchases button
    below them. Nothing takes money — the Play purchase flow is server 15 and
    unbuilt — but a member on Android today sees a full pricing screen backed by
    an empty catalogue. Worth knowing before anyone ships server 15 on top of it.

    Next lever is unchanged and it is Kevin 12: finish Play's app setup. Not
    because it is known to matter, but because it is the last variable left and
    is required before launch regardless.

    ── and then the bridge broke again, which is the real finding ──────────────

    **`clientAppUnavailable` IS TRANSIENT, AND IT CAN BE REPRODUCED ON DEMAND.**
    Clearing the Google Play Store's cache — suggested here to refresh the
    catalogue — brought the error straight back, now on every call:

    ```
    service resolved: yes
    getDetails THREW: OperationError: clientAppUnavailable
    candidate probe THREW: OperationError
    listPurchases THREW: OperationError: clientAppUnavailable
    ```

    Same APK, same account, same page, minutes apart, both readings. That
    settles several things at once:

    - **It was never our build.** No manifest, library or store setting changed
      between a working read and a broken one. The APK-level checks below were
      already saying this; this proves it.
    - **The bridge depends on Google Play Store app state**, not on the TWA and
      not on our DelegationService. Wiping that state breaks it; the service
      still _resolves_, so what fails is behind Play, past the bind.
    - **We have a reproduction, and the three upstream issues do not.** All of
      them describe it as permanent on a device and none can trigger it. "Clear
      Play Store cache" is a step several reporters tried as a FIX — which,
      given this, may be how some of them acquired it. Worth reporting upstream.

    So the recovery is to let Play Store rebuild what was cleared: open the Play
    Store app, let it finish loading, then relaunch Plus One. Expect the
    catalogue question to still be open underneath — the three ids were missing
    even while the bridge worked.

    **Do not treat a single reading as the state of this.** It flipped three
    times in an hour. Anything claimed about it needs the diagnostic re-read at
    the time of claiming — with `?diag=1` on the URL since `8df5b0f` — and a fix
    is only a fix if it survives a Play Store restart.

    ── what `adb logcat` said, 2026-08-27 ──────────────────────────────────────

    Wireless debugging over the LAN from WSL, no cable: `adb pair` against the
    code the phone shows, then `adb connect`. The pairing dialog is one-shot and
    its port differs from the connect port — both change every time it is
    opened, so the code has to be sent and used within the minute. The device is
    a **Galaxy S26 Ultra, Android 16 (SDK 36), Chrome 151, Play Store 52.8.58**.

    Launch the page directly with
    `adb shell am start -a android.intent.action.VIEW -d <url>` — assetlinks is
    verified, so it opens in the TWA rather than a browser, and it beats asking
    somebody to tap through. `adb exec-out screencap -p` reads the screen. For
    the on-page panel the url needs **`?diag=1`** since `8df5b0f`; logcat needs
    nothing, the `TwaBilling.DG` lines appear on any launch.

    What one launch produced, and it settles four things:

    ```
    TWAProviderPicker: Found TWA provider, finishing search: com.android.chrome
    TWAConnectionPool: Found app.loveplusone.DelegationService to handle request
    LicenseClient: License check succeeded.
    TwaBilling.DG: Calling getDetails for premium1month, premium3months, premium6months
    TwaBilling.DG: Connected to Play Billing library.
    TwaBilling.DG: GetDetails returned: 0
    TwaBilling.DG: ListPurchases returned: 0
    Finsky: Billing preferred account via installer for app.loveplusone: [<hash>]
    ```

    - **The provider is Chrome**, named outright. The Samsung Internet theory is
      dead, on this device.
    - **Our DelegationService is found and used.** Play Billing _connects_. So
      the bridge works, again — and `clientAppUnavailable` is confirmed
      transient rather than a property of this build or this phone.
    - **`GetDetails` answered 0 in 23ms with no network request.** Connected at
      `.646`, returned at `.669`. That is a local cache lookup against an empty
      cache, not a query that failed — which is a different problem from the one
      the console screens can show, and it is why nothing in Play Console looks
      wrong.
    - **Play binds billing to ONE account, chosen from installer data**, and
      this device has **17 Google accounts on it**. If the account Play picked
      is not the one opted into internal testing and named in licence testing,
      the catalogue is legitimately empty for it. That is the first thing to
      check and it is not visible from the app, the console, or the logs — the
      log prints an obfuscated id, not an address.

    The reinstall at 22:06 is what re-derived that binding, and it happened
    between the last working read and these. Worth knowing before reinstalling
    again to "fix" it.

    **The account is RIGHT, and the obfuscated id can be checked rather than
    guessed at.** Finsky's hash is plain
    `base64url(sha256(<account email>))` with the padding stripped — computed
    against the tester address it matches exactly. So Play is billing the sole
    account on the internal testing list, and the seventeen-accounts theory is
    dead. Keep the technique: it turns an opaque log line into a yes/no in one
    command, and it is the only way to answer this question without reading
    somebody's account list.

    ── so everything under our control is verified, and it still returns 0 ─────

    Confirmed correct, each read from the thing itself rather than from
    configuration: the build (APK manifest and resource table), the product ids
    (console), base plans Active and Backwards compatible (console), the TWA
    provider (logcat names Chrome), the DelegationService bind (logcat), Play
    Billing connecting (logcat), the licence check (logcat), and the billing
    account (hash match). Play answers 0 anyway, from a local cache, without
    asking the network.

    Also ruled out: **review status is not it.** The console banner says setup
    is incomplete and the app is unreviewed, which looks like a cause and is
    not — Play's own help says an in-app product "will be available for purchase
    as long as it's active, even if its app is unpublished".

    What remains is Play's own catalogue cache, which was deliberately wiped
    from here at about 22:00 and has not refilled. That is not something we can
    force. **Leave it overnight and re-read before doing anything else** — the
    diagnostic is deployed and `adb` is set up, so it is one command. **That URL
    now needs `?diag=1`** — the panel was gated in `8df5b0f` because it was live
    to every Android member on the payment screen, and without the parameter it
    does not fetch at all. Launching the bare URL shows nothing and reads
    exactly like the panel having been removed. If the ids
    resolve in the morning the cache was the whole story; if they still do not,
    the next lever is finishing Play's app setup (Kevin 12), not because it is
    known to matter but because it is the last variable left and it is required
    before launch regardless.

    ***

    Kept from when this was `clientAppUnavailable`, since none of it needs
    redoing:

    **The build is not the problem, read out of the BUILT APK rather than the
    source** — the artifact is what was installed, and a generated manifest is
    exactly the thing worth not taking on trust. `aapt2 dump` on
    `app-release-signed.apk`: `DelegationService` carries `android:enabled` and
    `android:exported` as references to `@bool/enableNotification`, and that
    bool resolves to **true** in the packaged resource table. That matters
    because a false `enableNotification` is bubblewrap#640's actual cause, and
    it is emphatically not ours. Also present: `com.android.vending.BILLING`,
    `PaymentActivity` bound to `org.chromium.intent.action.PAY` with
    `default_payment_method_name = https://play.google.com/billing`,
    `PaymentService` on `IS_READY_TO_PAY`, and
    `com.google.android.play.billingclient.version = 8.3.0`. The store side is
    right too — all three base plans ACTIVE with `legacyCompatible: true`, read
    off the Developer API.

    **It is a known upstream bug with no fix.** android-browser-helper#431,
    bubblewrap#640 and bubblewrap#805 all report exactly this on Android 13+
    (API 33 and above), with the Delegation Service failing to run where it
    works on Android 11 — #805 has it working on a Galaxy A03s (Android 11) and
    failing on a Galaxy S22 Ultra (Android 13) with the same Chrome build, which
    is as close to a controlled comparison as the reports get. All three are
    open, none has a maintainer answer, and between them the reporters had
    already tried clearing Play Store cache, raising targetSdk 33 → 34, and
    re-checking permissions. Kevin tried the licence-and-reinstall round on
    2026-08-27 and none of it moved.

    **The library bump was tried and did NOT fix it, 2026-08-28.** Version 2 was
    built with `androidbrowserhelper` at 2.7.3 against the previous 2.6.2 —
    verified in the resolved dependency tree, not just in the build file — and
    installed from the internal track. `clientAppUnavailable` still shows. So
    the old-core/new-billing pairing recorded below is eliminated, and with it
    the last thing on our side of the line.

    Held to this repo's own rule, that is strong evidence and not proof: the
    error flipped three times in an hour on the 27th, so one reading is not its
    state. But there is now nothing left to try here that is not upstream.

    **What follows was the reasoning for trying it, and it still reads as sound
    — which is the useful part.**
    `androidbrowserhelper` is pinned at **2.6.2** against a current **2.7.3**,
    while the `billing` artifact is at 1.2.0, the newest — and 2.7.0's notes
    read "Upgrade play billing library to v8.3.0 **and fix listener
    compatibility**". So the two halves are from different eras, with the newer
    billing client and the core from before the compatibility fix. Nothing in
    any release note mentions `clientAppUnavailable` or the delegation bind, so
    this is a plausible pairing problem rather than a known fix. It costs a
    rebuild, a versionCode bump and a reinstall to find out.

    **What would actually settle it is `adb logcat`.** Chrome logs why the bind
    to `DelegationService` failed, and nothing on the page can see that — every
    round so far has been inferred from a DOMException with no detail. `adb` is
    installed on WSL and Android's wireless debugging reaches it over the LAN,
    so this needs no cable and no Windows-side USB passthrough. Do that before
    spending another build.

    Failing all of it, the honest options are to wait, or to ship Android
    without an in-app purchase path until it is fixed — a product decision
    rather than a technical one, and Kevin's.

14. **A real Play purchase did not grant, and the cause was one arrow
    function.** Found 2026-08-29, on the first purchase anybody made.

    Vercel's OIDC federation was returning no token, so `verifyPlayPurchase`
    raised "google auth unavailable", `submitPlayPurchase` answered
    "unverified", no `iap_entitlements` row was written, and Play retried the
    notification indefinitely. A member pays and gets nothing, and Play refunds
    an unacknowledged subscription after 72 hours without telling anybody.

    **google-auth-library calls the subject token supplier as
    `getSubjectToken(context)`**, where context is `{ audience,
subjectTokenType }`. `getVercelOidcToken` takes an options object whose
    `audience` field means "exchange for a token carrying that audience". So
    passing the function bare — which is what Vercel's own documented example
    does — feeds the STS context in as options and mints a token with
    `aud: //iam.googleapis.com/...`. Wrap it: `() => getVercelOidcToken()`.

    Two things worth carrying beyond the fix:

    - **The error quoted our own input back and read as a diagnosis.**
      "The audience in ID Token [//iam.googleapis.com/...] does not match the
      expected audience" names the value we had just sent, so it points at the
      STS request rather than at the token. It cost two deploys — one changing
      the GCP provider theory, one changing the audience to a different wrong
      value. The tell was that the bracketed string tracked whatever we sent.
    - **The chain was recorded as "proven" on 2026-08-27 and half of it had
      never run.** That proof was a test notification answering 200 — but the
      route returns early on a test notification and never calls Google at all.
      Pub/Sub delivery and caller verification were proven; the Developer API
      call was not. A green light from the wrong end of the pipe.

    Read the provider config rather than inferring it, which settles the
    audience question in one command:

    ```
    gcloud iam workload-identity-pools providers describe vercel \
      --location=global --workload-identity-pool=vercel --project=luxweb-studio
    ```

    It allows `https://vercel.com/kevin-bandisons-projects` — Vercel's default,
    and what an un-argumented call produces.

15. **The Play purchase flow, which is on no list until now.** Server 12 records
    WHY three products and 10 records the TWA that would run them, but nothing
    said who builds the buying. It is web-side — a TWA runs `apps/web` in real
    Chrome — so it is this lane, not the shells one.

    **THIS ENTRY IS STALE AND BOTH HALVES ARE BUILT.** Corrected 2026-08-29 by
    reading the tree rather than the entry. It still said "blocked… cannot be
    written at all yet" — written before the service account existed — and the
    blocker cleared the same day it was raised: Kevin 16 resolved the account on
    2026-08-27, and server 14 fixed the last real defect in the chain on the
    29th. Nobody came back to this paragraph, so the list said unbuildable about
    something that had shipped.

    What actually exists: `lib/play-iap.ts` (`getDetails`, a `PaymentRequest`
    against `https://play.google.com/billing`, and the acknowledge step),
    `play-purchase.tsx`, and `play-actions.ts` with `submitPlayPurchase` →
    `verifyPlayPurchase` → `record_iap_entitlement` with `store: 'google'` —
    exactly the shape this entry predicted.

    **What is left is not code.** Play returns an EMPTY CATALOGUE for the three
    product ids, so `getDetails` finds nothing to sell and the flow cannot be
    exercised end to end. That is server 13, and it is not ours: everything on
    our side of the line is verified correct. The last untried lever is Kevin 12,
    finishing Play's app setup.

    Kept below because the reasoning is still the reasoning, and because it
    records why Play differs from Apple:

    A Play purchase hands back an opaque `purchaseToken`, not a signed
    statement. There is nothing to verify offline. It has to be exchanged with
    the Play Developer API, which is what the service account is for. So unlike
    `submitAppStoreTransaction`, the server half could not have been written
    first.

    Do NOT ship the client half alone. macOS made the same call on iOS and was
    right: a button that takes money and grants nothing is worse than a paid
    tier that is unreachable.

16. ~~**The Play diagnostic panel must come out**~~ — **resolved a different
    way 2026-08-29: gated behind `?diag=1` rather than kept or removed.** Kevin's
    call, and it keeps the instrument while no member can meet it.

    Everything below is the finding as WSL wrote it, kept because the reasoning
    about `HANDOFF.md` is the durable part and because the objection that had to
    be overturned is worth not re-deriving.

    **The objection was real and is now obsolete.** The panel had been behind
    `?debug=play` once and that was abandoned with a written reason: a TWA has
    no address bar, so there is no way to reach a query parameter from inside
    the app being diagnosed. True when written. Not true now —
    `adb shell am start -a android.intent.action.VIEW -d <url>` launches any URL
    straight into the TWA because assetlinks is verified, and that is how this
    panel has actually been read on both occasions. **The technique arrived
    after the objection**, and nobody went back to the paragraph. Same shape as
    server 15.

    Gated at the FETCH, not the render, so a member does not silently run three
    product-id probes to produce something nobody will see.

    The original finding follows.

    `play-purchase.tsx` renders a `debugPanel` of raw `playDiagnostics()` output
    when `broken` is true, which is whenever `getDetails` returns nothing. That
    is the state Android is in today, so **any member who opens the premium
    screen in the TWA can meet it.** It shows service-resolution status,
    referrer, user agent and product-id probe results. It is a developer tool
    and it is deployed.

    **It must not be removed yet.** It is the instrument server 13 is being
    diagnosed with, and the catalogue is still empty. Removing it now would take
    away the only view we have of the thing that is broken.

    **The condition is: once Android has been bought from once.** At that point
    `broken` should never be true for a real member, and a member who somehow
    hits it should meet an ordinary error rather than a debug dump.

    ── why this is an item rather than a note ──────────────────────────────────

    It was already written down, accurately and prominently, in the WSL session
    block of `HANDOFF.md` dated 2026-08-27. That is the OLDEST of exactly three
    blocks, and that file's own rule is "keep the last three; delete below
    that." So the next session block written deletes the note, and the panel
    ships to members permanently with nothing anywhere recording that it should
    not.

    That is the failure macOS named on the shells side the same day: **a note
    that describes work without creating any.** Every session reads it, agrees,
    and does nothing, because there is nothing in a lane to pick up. This one
    additionally had a delete date. `HANDOFF.md` is a whiteboard by design and
    is the wrong place for anything that has to outlive three sessions —
    `BACKLOG.md` says so at the top and this is the proof.

17. ~~**Browse can filter on three things, and the profile holds far more.**~~
    — done 2026-08-29 in `3fc2212`. Eleven filters, eight of them folded, and the
    four lifestyle answers now render on the card and the connect panel. No
    migration, exactly as this entry predicted. Everything below is kept because
    the four deliberate omissions are the part worth not re-deciding.

    Distance, intention, active-this-week — that was every filter in the app.
    Kevin asked for much deeper filtering 2026-08-29 and this was the half that
    needed no schema at all.

    **`smokes`, `drinks`, `kids` and `kids_plan` are already collected, already
    editable, and go nowhere.** Onboarding asks for all four
    (`onboarding/preferences/preferences-form.tsx`), the profile edits them, and
    `visible_profiles` carries them through `matched_profiles` via `select v.*`
    — and then no card shows them and no filter reads them. Four questions every
    member answers that do nothing. So this is a `.eq()` and a `<select>`: no
    migration, no column grants, and nothing to re-answer on either store's
    data-safety form.

    Everything below is in the view today: smokes · drinks · kids · kids plan ·
    age as a browse-narrowing filter · has a bio · has answered prompts ·
    active-recency as a ladder rather than one checkbox.

    **The `<details>` fold verified in WKWebView 2026-08-29** by the macOS
    session, since this is `apps/web` and reaches both engines. Loaded with
    `?kids=none` in the iOS 27.0 Simulator: the fold arrives ALREADY OPEN,
    `open` is true at runtime and not merely in the server HTML, and the
    summary reads "More filters · 1 filter on" with Kids showing "No kids".
    So the failure worth worrying about — a member following a filtered link,
    seeing a short page, and never learning the reason is folded one tap above
    them — does not happen on iOS. The TWA half was checked separately on a
    Galaxy S26 Ultra and behaves the same.

    **That verification now describes a PREMIUM member only**, and 18d is why.
    Every filter behind the fold is paid, so for a free member they are dropped
    at parse time, the advanced count is always 0, and the fold arrives CLOSED
    however the URL is written. Which is correct — nothing is applied, so
    nothing is hidden — but it means `?kids=none` no longer opens the fold for
    the majority of members, and a check that says "verified" without saying for
    whom would be believed. Caught by macOS while photographing 18d.

    **Age here is NOT the age wall.** `matched_profiles` enforces a mutual range
    — both sides have to want each other's age or the row does not exist. A
    browse filter narrows what already passed that and cannot widen it. Two
    different mechanisms, and conflating them would let a filter look like it
    was reaching people the wall excluded.

    **Display is a prerequisite, not a follow-up.** Filtering on an attribute
    that appears on no card is a control with no visible effect. The connect
    panel is worse than Browse — it selects `id, display_name, prompts` and
    nothing else, so the screen where somebody decides whether to reach out
    shows a name, a photo and a prompt.

    **Soft, not hard, and the argument is already in this repo.**
    `20260818000100` refuses to make lifestyle a wall: "this is a pool of people
    who share a diagnosis in one city… Filtering that pool again on smoking
    would empty it." That reasoning does not weaken because the control moved
    from the Drop to Browse. Rank and reorder, show a live count of what a
    filter costs, and allow at most a couple of true exclusions — a dozen
    exclusion filters over a thin pool renders an empty grid, and a member reads
    an empty grid as a dead app rather than as their own filters.

    **A compatibility threshold cannot be in this item.** `compatibilityFor`
    runs after the query, on the 60 rows already fetched, so `≥70%` would fetch
    sixty and render twelve — and the "N people active" stat beside it would
    describe a different set. Sorting within the page is free and fine; a real
    threshold needs the score in SQL, which is item 17's view rebuild.

    **Health-adjacent stays out. Kevin's call 2026-08-29.** `condition` and
    `u_equals_u` are both in the view and both one line away from being
    filterable. Held pending a decision — U=U is genuinely valued inside the HIV
    community and is self-declared, and condition detail sorts people by their
    diagnosis, which are not the same question and should not be settled
    together. Adding either later is small; that is the reason to wait.

    Also deliberately not built: **a "has clear photos" filter.** `photo_privacy`
    is right there and it would work. It is a filter aimed squarely at the
    people who chose to blur, on an app whose premise is that disclosure is
    hard.

18. ~~**The attributes the profile does not hold yet.**~~ — done and APPLIED
    2026-08-29, across `6ae20c7`, `d125bc6`, `e86b146` and `612c4e5`. Eleven
    columns rather than the ten this entry sketched: height, weight,
    relationship structure, exercise, diet, pets, education, work, languages,
    religion and politics. Migrations 20260829000100, 000200 and 000300, all
    live, ledger at 79 of 93.

    Religion and politics were held here as a counsel question and Kevin
    answered directly; weight was added on his ask and is the one classified as
    HEALTH data rather than profile content — it is what HealthKit stores, and
    on a pool defined by a diagnosis it tracks treatment history closely enough
    to stand in for it. That widens the scope of the Health declaration from
    three fields behind a consent screen to one typed on a public profile, and
    it belongs in Kevin 1 with the other two. None is named in the privacy
    policy yet.

    Kept below because two of its predictions were right and cost real time.

    Originally: Height, relationship
    structure (mono / ENM / poly / unsure), languages, exercise, diet, pets,
    religion, politics, education, work. Kevin asked for depth 2026-08-29 and
    item 16 spends what already exists; this is the part that costs a migration.

    Per column: enum or type, the column, **column-level grants** (this repo
    grants select/insert/update per column and `check:db` enforces it), a
    `visible_profiles` rebuild to carry it, onboarding or the profile editor,
    the card, the filter — **and both stores' data-safety answers**.
    `privacy-labels.ts` and `play-data-safety.ts` have a test that fails when
    they disagree, so a new column propagates all the way to two review forms.
    That chain is working as intended and it is why none of these is a
    one-liner.

    **Do not put these in onboarding.** It is nine steps already. Collect them
    after signup against a profile-completeness nudge — a member who has met
    somebody has a reason to fill this in, and a member who has not is being
    asked to answer eleven more questions before seeing a single face.

    Rebuilding `visible_profiles` is a `drop view` — see the ownership note in
    `HANDOFF.md` before starting, since item 18 rebuilds it too.

19. **The premium tier promises five things and one is built.**
    `PREMIUM_INCLUDES` (`packages/config/src/pricing.ts:121`) renders on TWO
    public pages — `/pricing` and the premium settings screen — so this is being
    sold today to anyone who can reach a buy button:

    - "10 connects a day" — **built**, `CONNECTS.premiumPerDay`.
    - ~~"Advanced browse filters"~~ — **done 2026-08-29.** Built by item 16,
      gated by 18d. Free: distance, intention, activity, age — the four above
      the fold, which are what somebody opens Browse to set, and Decision
      #23/#24 keeps the free tier usable. Paid: the fifteen behind "More
      filters", which is where `PREMIUM_INCLUDES` always drew the line.

      **Enforced in `parseBrowseFilters`, not by disabling a control.** The URL
      is the real input — hand-typed, bookmarked, shared — and a member whose
      premium lapsed still has yesterday's filtered link. Paid filters are
      DROPPED from the parsed state for a free member, so the query, the match
      count and the rendered control all agree: the select shows "Any" because
      the filter genuinely is not applied, rather than displaying "No kids" over
      a grid that ignored it.

      Ignored rather than refused, which is the lapse rule and the mirror of
      18b's: the safe direction shows a member MORE people and never makes the
      member themselves more visible.

      Kevin decided the harder half 2026-08-29: a paid filter APPEARS DISABLED
      rather than being absent, and at fifteen controls the state is said ONCE
      PER GROUP — `disabled` on the fieldset, a Premium tag on the legend, and
      one line with a link at the bottom of the fold. Fifteen chips would be a
      page telling somebody fifteen times that they cannot have something, which
      buries the controls it exists to show them.

      The question was not gating, it was what a free member is shown. Absent
      means they cannot tell what Premium would add; disabled means they can,
      at the cost of a screen that says "you cannot have this" once per paid
      control. Kevin chose disabled — so a free member sees the whole shape of
      the tier on the screen where it would be used, rather than a shorter
      screen and a pricing page somewhere else.

      **What that decision now depends on, and it is not decided.** With
      nineteen filters, "disabled" stops being a state one control is in and
      becomes the design of the screen. `ui.tsx` marks every disabled control
      with `disabled:opacity-55` and nothing else — `3e74775` fixed the real
      bug, hover firing on disabled buttons, and deliberately left the opacity
      alone as Kevin's call. At 55% a filled control still reads as pressable.
      One of those is a flagged nicety; a page carrying a dozen of them is the
      first impression of the paid tier. **Settle the disabled treatment before
      building 18d**, not after.

      The copy problem is the rest of it: a member has to be told what a
      control does BEFORE they meet the consequence, not after. Same shape as
      the sentence 18b needed about the first photo.

    - "Incognito browse — visible only to people you've already connected with"
      — **the string appears nowhere else in the repo.** Needs a column and a
      `visible_profiles` predicate, which is the second rebuild the HANDOFF note
      is about.
    - ~~"Who's active near you"~~ — **done 2026-08-29 in `7e4c93b`, and applied.**
      Not the surface this entry imagined, and the reason is worth keeping.

      By the time it was built, item 16 had shipped a FREE day/week/month
      activity ladder on Browse, so a premium list of active people would have
      been `/app/browse?activity=day` behind a paywall. And the obvious build
      was banned twice besides: §8 forbids identity and forbids count
      granularity below five, and `claim_nearby_joins` names this exact
      sentence — "come back, there are new people" — as the §3.3 engagement
      loop.

      So it is an alert the MEMBER builds: `activity_alerts`, a radius off
      `RADIUS.alertLadderMi`, off until they create it, in-app until they ask
      for push. §3.3 bans the app nudging a member; it does not ban a member
      asking to be told, and that distinction is the whole argument for it
      being on a tier whose line is reach and control. If it is ever revisited,
      that is the sentence to argue with.

      Pinned by `activity-alert.test.ts`, because each of these fails silently:
      `notified_at` is withheld from the member's update grant so nobody can
      clear their own cooldown, the count decides whether to send and never
      what it says, the floor is `NEARBY_JOIN_MIN_COUNT` shared rather than a
      second five, premium is checked when the alert FIRES so a lapse stops it
      without deleting the radius, and `notifier()` is built before the
      self-consuming claim.

      **Seen in WKWebView 2026-08-29, NOT in the TWA.** Rendered in the iOS
      27.0 Simulator against the real component — the radius `<select>`
      computes to 16px, six options, and the section lays out correctly. The
      Android half is still unlooked-at, and per `AGENTS.md` that is not the
      same engine.

      What the run also settled, and it is worth more than the pass: the
      16px rule cannot be checked statically. `design-system.test.ts` scans
      for a literal `text-[Npx]` inside a control's tag, so a field that
      INHERITS a small size is invisible to it. Measured at runtime, every
      text-and-select field on both components is >= 16px and the only two
      under are checkboxes, which do not raise a keyboard and so do not zoom.
      No bug — but the gate is narrower than it reads, and the next person to
      trust it should know that.

    - ~~"Fine-grained photo privacy controls"~~ — **done 2026-08-29 in
      `43a35dc`, applied.** Per-photo rather than more audiences, and paid with
      a free floor. Kevin settled both halves; the second is the one worth not
      re-deciding.

      **Safety stays free.** The profile-wide blur is untouched and still free,
      so no member's protection is behind the paywall — anybody can blur
      everything. Premium buys arrangement. That was put to Kevin explicitly
      rather than assumed, because 20260818000100 and item 16 above both refuse
      to build things that press on the people who chose to blur, and charging
      for privacy on a disclosure-first app is the same shape.

      **A lapse must never make a member more visible.** Overrides are kept for
      ever; premium gates only the SETTING of one, and clearing back to "follow
      the profile" is never gated or a lapsed member is stranded. Pinned by
      `photo-privacy.test.ts`, which greps every migration for anything that
      nulls the column and checks the premium-expiry sweep never mentions
      photos.

      **The gate is a trigger, and that is a property of the schema.**
      `profile_photos` carries a whole-table update grant to `authenticated`
      (20260813000700), so a member can PATCH the column straight through
      PostgREST and a check in the server action is decoration. `profiles` has
      no such grant, which is why 18a's answer is the opposite — never grant
      the column and write it through a definer function. Read
      `information_schema.role_table_grants`, not the creating migration.

      **Position 0 is unchanged, deliberately.** `photosFor` is
      `.eq("position", 0)`, so the first photo is what all six card surfaces
      show. Picking the first CLEAR photo instead is the tempting alternative
      and it is the same implicit un-blurring the lapse rule refuses. What
      changed is that the gallery now SAYS the first photo is the one every card
      shows — a hidden consequence made informed, which is cheaper than a
      redesign and addresses the actual problem.

      **Unseen in either shell.**

    **Kevin's call 2026-08-29: build them, do not cut the lines.** So this is
    four features, not a copy edit.

    **Before building 18a: READ THE GRANT SHAPE, because it decides where the
    gate can live, and the two halves of this item differ.** Checked against the
    live database 2026-08-29 rather than inferred from the migrations:

    - `profile_photos` carries a **whole-table** `update` grant to
      `authenticated` from 20260813000700, so a member can PATCH any column on
      their own rows straight through PostgREST. A premium check in a server
      action there is decoration — the action is not the only writer and never
      was. macOS found this building 18b and gated it with a
      `before insert or update` trigger, which holds whichever path the write
      arrives on.
    - `profiles` carries **no whole-table grant at all** — column-level only,
      32 columns updatable. So the gate for incognito is stronger and simpler:
      **do not grant `update (incognito)` to `authenticated` at all**, and write
      it through a `security definer` function that checks premium, the way
      `record_iap_entitlement` already writes `iap_entitlements`. A member then
      has no path to the column, rather than a path that is checked.

    The generalisation, which is the part worth keeping: the right gate is not a
    style preference, it is a consequence of how the table was granted, and this
    schema does BOTH. Read `information_schema.role_table_grants` before
    deciding, not the migration that created the table — 20260826000200 exists
    because a new table arrives with `anon` and `authenticated` holding
    everything, and a grant that was revoked later is not visible in the file
    that made it.

    **And the lapse rule, which is the mirror of 18b's.** When premium ends,
    premium-only filters must be IGNORED rather than error or persist. The safe
    direction is the one that shows a member MORE people and never makes the
    member themselves more visible — the same asymmetry macOS settled for
    per-photo privacy, where overrides are retained forever and premium gates
    only the setting of them. Pin it by test rather than by comment: a lapsed
    subscription silently un-blurring somebody is the worst failure this app
    could have, and the filter equivalent is quieter but the same shape.

    Whatever gets added to sweeten the tier has to clear `PREMIUM_NEVER` in the
    same file — no ranking or visibility boosts, no extra drops, no undo, no
    fuse extensions, no wall bypass. Decision #23/#24 says the paid line is
    **reach and control**, which is what the four above already are, and what a
    saved search with an alert would be. Anything that makes a paying member
    more likely to be SEEN is on the never list, and that list is pinned by a
    test.

20. ~~**A live match count beside the filters.**~~ — done 2026-08-29 in
    `612c4e5`, alongside the rest of 17's filter surface. Both counts run
    through one `applyFilters` helper, because a count applying different
    predicates from the grid beneath it is worse than no count at all.

    Originally: **A live match count beside the filters.** The mechanism that makes item
    16's soft-filter argument true rather than aspirational: a member widening
    or narrowing sees what each control costs before they are staring at an
    empty grid. Needs the count query to follow the filters, which today it
    deliberately does not — the "N people active" stat is a fact about the area
    and drops the intention filter on purpose (`browse/page.tsx`). Two numbers
    with two jobs, and the difference between them wants saying on screen.

21. ~~**A waitlist, and the closed beta it feeds.**~~ — done and APPLIED
    2026-08-31, at Kevin's ask. Migrations 20260831000100 and 000200 are live,
    ledger at 83 of 98, `check:db` green.

    What exists: `/waitlist` with a metro select and an optional "I would test
    an early build"; double opt-in by email; one-click leave with no account;
    `/beta/<code>` invitations; an admin screen at `/admin/waitlist` that shows
    density by metro and produces paste-ready tester lists for Play and
    TestFlight; and the gate itself.

    **The gate is on account CREATION only, and that is the whole design.**
    `/onboarding/phone` is the one call in the app that can mint an account, so
    it passes `shouldCreateUser: invited`. `/sign-in` was already closed to
    non-members — `shouldCreateUser: false` on both branches since it was
    written — so gating it a second time would do nothing except break its
    anti-enumeration property and risk locking somebody out of their own data.

    Four cases, and the reason the shape is right:

    | who                | what happens                                         |
    | ------------------ | ---------------------------------------------------- |
    | invited stranger   | account created                                      |
    | existing member    | account exists, so the OTP sends — invitation or not |
    | **store reviewer** | the same case. Signs in to an account that exists    |
    | uninvited stranger | told it is a closed beta, offered the list           |

    The reviewer row is the one worth keeping. Gating sign-in would have caused
    exactly the rejection this gate most looks like it would cause, and
    `apps/android/README.md`'s App access section is rewritten because the old
    reviewer note is now actively wrong — it said creating an account needs an
    identity check, which invites a reviewer to go and try something that is
    refused outright.

    **What the table deliberately does not hold**, because an address on this
    list is a health disclosure by inference: no condition, no birthdate, no
    name, no phone, nothing finer than a metro picked from a fixed list, and no
    IP or UTM. `WAITLIST_NEVER` in `packages/config/src/waitlist.ts` is the
    explicit list with the argument against each, and `waitlist.test.ts` reads
    the migration and fails on a column matching any of them. Proven by planting
    one.

    **It is the only table here granted to nobody at all.** No RLS policies, no
    grant to `anon` or `authenticated`, `force row level security`. The service
    client is the only reader and writer. The specific hole that closes: a
    definer RPC callable by `anon` would RETURN the confirmation token to
    whoever called it, so anybody could join with somebody else's address and
    confirm it themselves — which is double opt-in doing nothing.

    That made `check:db`'s "every table has at least one policy" fail, and the
    fix was to SPLIT it rather than relax it — `check:sql` had the correct rule
    all along ("every table **granted to a role** has at least one policy"), and
    the live-schema version was broader than the failure it describes. It now
    asserts both halves, including that a closed table stays granted to nobody,
    which is strictly stronger than what it replaced. Watched it fail on a
    planted grant.

22. **Reopening: what has to change when the beta ends.** Written now because
    the closed beta is deliberately temporary and every piece of it is a thing
    somebody has to remember to undo.

    - `/` and `site-header.tsx` point at `/waitlist`. They go back to
      `/onboarding/phone` with `DRAFT_COPY.home.getStarted`, which is sitting in
      `KNOWINGLY_UNUSED` in `copy-is-wired.test.ts` waiting for it. **That map
      cleans itself** — the moment anything references `.getStarted` the test
      fails and demands the entry be removed, so this cannot rot.
    - `sign-in-form.tsx`'s "new here" link and `/i/[code]`'s referral button
      both point at `/waitlist` too. The referral one is the interesting case:
      during the beta a member's referral does NOT grant entry, because letting
      it would mean any member could mint a way through the gate. Attribution
      still survives the detour — `plusone_ref` lives thirty days and is
      attributed once there is an account.
    - The gate in `onboarding/phone/actions.ts` becomes `shouldCreateUser: true`
      again, and `waitlist.test.ts` in `apps/web/src/lib` will fail until its
      assertions are updated — deliberately, since that file is the record of
      what the gate is for.
    - `apps/android/README.md`'s App access note must go back, and the App Store
      equivalent with it. **Do not leave a reviewer note describing a beta that
      has ended** — it is the same class of error as the one being fixed there
      now.

    The waitlist itself stays. It is worth having whether or not signup is open:
    it is the only thing that turns `COPY.drop.thin` from an apology into a
    plan.

23. **Adding a tester is still two manual steps, and one of them need not be.**
    Raised by Kevin 2026-08-31 asking the right question: "when someone on iOS
    fills out the waitlist form, do I have to manually add them to App Store
    Connect?" Today, yes.

    What the admin screen already does: collects the store account, groups by
    metro, and hands over paste-ready lists. What it cannot do is put anybody on
    a track.

    |         | today                                                                                                     | could be                                                                                       |
    | ------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
    | Android | paste the Google account into the closed-testing list; the tester opts in themselves from the public link | Play Developer API can manage testers                                                          |
    | iOS     | add each Apple ID by hand in App Store Connect                                                            | **a TestFlight public link removes it entirely**, or the App Store Connect API can add testers |

    **The public link is the cheap answer and it is unusually safe here.** The
    normal objection — anybody with the URL can install — barely applies,
    because installing is not joining: `/onboarding/phone` refuses to create an
    account without a beta invitation, so a stranger who follows the link gets a
    shell they cannot sign into. The account gate is the real wall and the store
    track was never doing that work.

    Its cost is Apple's: a public link needs an EXTERNAL testing group, which
    needs the build to pass Beta App Review. One-time rather than per-tester,
    which is the right trade — but it is a gate, and with the 2.1 correspondence
    unresolved its timing is unknown. That is why `BETA_LINKS.ios.publicLink` is
    null rather than promised.

    The API route on either store is real work and needs credentials that do not
    exist yet. **Do not build it before the public link has been tried**, which
    costs one console setting and makes the iOS half of this item disappear.

24. ~~**Somewhere to report a bug or ask for something.**~~ — done and APPLIED
    2026-08-31 at Kevin's ask, alongside the beta. Migration 20260831000300 is
    live; ledger 84 of 99.

    `/app/feedback` for members, `/admin/feedback` for triage, a fifth settings
    tab, and `support@loveplusone.app` named on the form for the one report the
    form cannot take — "I cannot sign in".

    **Deliberately NOT `reports`.** That table is moderation: an accusation
    about another member, read under a duty of care, whose subject must never
    learn who filed it. Feedback is about the software, is attributed on purpose
    so we can reply, and has no subject to protect. One table would mean one
    queue and a permission shape satisfying both, which in practice is the
    weaker of the two.

    **Private, not a public board.** A roadmap with upvotes prioritises better
    and was refused: a feature request carries a name, and a name on a board
    belonging to an HSV and HIV app is a disclosure nobody set out to make. What
    a board is actually FOR from the member's side — knowing it did not vanish —
    is served by them seeing their own reports and status. `declined` is a real
    status and shown as plainly as `done`, because being told no beats watching
    something that will never move.

    **The context is the part testers never include**, and one field earns its
    keep more than the rest: `surface`. AGENTS.md's standing rule is that a fix
    verified in one engine is not verified in the other, so a report that does
    not say whether it came from Chrome, a TWA or WKWebView cannot be acted on
    without asking. `inTwa()` is checked BEFORE `nativePlatform()` — a TWA has
    no `window.Capacitor`, so the other order files every Android TWA report as
    "browser" and loses exactly the distinction the field exists for. Pinned.

    **`page` is the route SHAPE and never the path.** `/app/chats/[id]`, never
    `/app/chats/3f2a…` — a chat id here resolves to two people and a diagnosis.
    Query strings and fragments are dropped whole rather than filtered, since
    that is where an id smuggles itself in. Stripped in `lib/feedback.ts`,
    refused by `feedback_page_shape`, and pinned by a test that plants a uuid, a
    token and a query string — plus a floor proving the stripper does not eat
    ordinary route names, because a perfectly private one would be useless.

    Three existing guards caught this on the way in and all three were right:
    the privacy chain refused an unclassified table, `rpc-error.ts` refused two
    unclassified raise messages, and the layout guard caught a duplicated top
    margin.

25. ~~**Teaching a new member what this app does differently.**~~ — done
    2026-08-31 at Kevin's ask. No migration: see below.

    **Not a tour, deliberately.** The obvious build is a spotlight on first
    launch — dim the screen, point at a button, Next, Next, Done. It is shown
    BEFORE anybody has a question, so it reads as an obstacle to the app rather
    than help with it, and none of it is on screen at the moment it becomes
    relevant. Four inline notes instead, each on the one screen where its
    mechanic is met.

    **Four, because most of it was already written.** `dropConnectsFree` already
    says replying costs nothing; `chatEmptyBody` already says no clever opener
    is needed; `browseEmpty` already says what to do about an empty grid. A hint
    repeating any of that is noise and a second copy that will drift. The rule
    for adding one is that **it must teach something no screen says**, each
    entry records the misunderstanding it prevents, and a test refuses a body
    that duplicates existing copy.

    What is covered: the Drop is three and does not grow; there is no like
    button; the chat has seven days and a plan removes the timer; rooms are not
    for dating.

    **Nothing about this reaches the database, and that is the interesting
    part.** Which tips somebody dismissed is behavioural data about how a
    particular person uses an HSV and HIV app — server-side it would live in a
    table, in every backup, and in any subject access request, for the sake of
    not showing a four-line note twice. A cookie was the other candidate and is
    worse: it is sent with every request, so it lands in access logs.
    `localStorage` never leaves the browser.

    The cost, stated rather than discovered: hints reappear on a new device,
    after clearing site data, and once per shell — the TWA shares Chrome's
    storage and the iOS WebView has its own. All three are a note somebody reads
    again. A test greps every migration to keep it that way.

    **The content is the disposable half.** `/app/feedback` shipped the same day
    and is what should decide this list. After a few weeks of real reports
    expect it to be wrong in ways nobody can predict from the inside — the
    mechanism is the durable part, and changing the list costs one edit.

    Two things worth keeping about the build. The lint rule
    `react-hooks/set-state-in-effect` refused the obvious implementation and was
    right: reading external storage is `useSyncExternalStore`, and the snapshot
    has to be the RAW STRING rather than a parsed array, because snapshots are
    compared by identity and a fresh array every call is an infinite loop. And
    the store keeps its own listener set — the `storage` event fires in other
    tabs and never in the one that wrote, so dismissing a hint would otherwise
    leave it on screen until a reload.

26. ~~**Chrome posts the TWA's notifications instead of delegating them.**~~ —
    **RESOLVED 2026-09-01, and the cause is a cache nobody would guess at.**

    Chrome evaluates whether the TWA can post notifications and REMEMBERS the
    answer. `POST_NOTIFICATIONS` was denied on the app, so Chrome checked once,
    found the app could not post, and fell back to posting under its own package
    — correctly. Granting the permission afterwards changed nothing, because
    Chrome never asked again.

    Force-stopping Chrome makes it re-evaluate. Immediately after:

    ```
    TWAConnectionPool: Found app.loveplusone.DelegationService to handle
                       request for https://www.loveplusone.app/
    pkg=app.loveplusone   channel=general_channel_id
    ```

    Posted by the APP, on the app's own channel, with the app's name and icon —
    which is what a member sees on a lock screen instead of the origin.

    **So the order matters and nothing says so.** Grant the permission BEFORE
    Chrome first tries to post for that origin, or force-stop Chrome afterwards.
    On a fresh install the app's own prompt does this correctly; granting
    through system settings later does not, because by then Chrome has already
    decided.

    Everything below was verified along the way and none of it was ever wrong —
    kept because it is the elimination that made the cache the only thing left.

    ── the original finding ───────────────────────────────────────────────────

    Found 2026-09-01 with a clean experiment of Kevin's.

    ```
    PlusOne notifications ON,  Chrome ON   ->  a CHROME notification appears
    PlusOne notifications ON,  Chrome OFF  ->  nothing at all
    ```

    So the push arrives, Chrome renders it, and the DelegationService is never
    asked. If delegation were working, Chrome's own notification setting would
    be irrelevant — the TWA posts under its own package.

    **CORRECTED 2026-09-01, and the correction is the useful part.** This entry
    was written believing delegation was why nothing appeared. It was not.
    Chrome had been posting all along and ANDROID was throwing the notification
    away one layer below, because Chrome's **"Sites" notification channel group
    was blocked**:

    ```
    NotificationChannelGroup{mId='sites', mName=Sites, mBlocked=true, mUserLockedFields=1}
    NotificationService: isRecordBlocked = true
    NotificationService: Suppressing notification from package com.android.chrome by user request.
    ```

    Unblocking it fixed everything with no code change: the same push now lands
    in the shade, `pkg=com.android.chrome`, zero suppression lines. Confirmed
    over adb end to end.

    `mUserLockedFields=1` means it was set deliberately — almost certainly while
    turning Chrome's notifications off to run the experiment above. The
    app-level toggle does NOT restore the group, which is what made the
    experiment misleading: it looked like "PlusOne on, Chrome off, nothing" was
    about delegation when the second half had silently disabled every web
    notification on the device.

    **Everything below about delegation remains true and remains unsolved** —
    Chrome posts rather than delegating, so the lock screen shows the origin
    instead of the app's name. It is just not why anybody saw nothing, and
    anybody picking this up should not start from that premise.

    **PlusOne was blocked in Android's notification settings until this
    session**, which is why nothing appeared for hours and why the app was
    absent from the "recently sent" list. Granting it did not enable delegation;
    it only made the app eligible.

    ── what is confirmed correct, from the PACKAGED APK ────────────────────────

    Read with `aapt2` off `app-release-signed.apk`, not from `twa-manifest.json`
    — the same rule that settled `enableNotification` for billing:

    ```
    uses-permission  android.permission.POST_NOTIFICATIONS      declared
    service          app.loveplusone.DelegationService
                     android:enabled  -> @bool/enableNotification -> true
                     android:exported -> @bool/enableNotification -> true
    intent-filter    android.support.customtabs.trusted.TRUSTED_WEB_ACTIVITY_SERVICE
                     + android.intent.category.DEFAULT
    meta-data        ...trusted.SMALL_ICON -> drawable/ic_notification_icon
                     (mdpi, hdpi, xhdpi, xxhdpi — all present)
    activity         NotificationPermissionRequestActivity      declared
    ```

    A missing or unresolvable SMALL_ICON is the most-cited cause of delegated
    notifications failing silently. Ours resolves at four densities.

    ── what has NOT been tried ────────────────────────────────────────────────

    - **Force-stop and relaunch the TWA.** POST_NOTIFICATIONS was granted
      through system settings rather than through the app's own prompt, and the
      TWA connection is pooled — Chrome may be holding a decision made while the
      app was still blocked.
    - **Uninstall, reinstall, and accept the prompt on first launch.**
      `NotificationPermissionRequestActivity` is what android-browser-helper is
      built around, and the settings route bypasses it entirely.
    - **`adb logcat` during a push.** It named the DelegationService outright for
      billing (`TWAConnectionPool: Found app.loveplusone.DelegationService`), so
      it will say something here too. Needs Kevin and the phone — see Kevin 17.

    ── does it block anything ─────────────────────────────────────────────────

    **No, and that is worth saying before anybody spends a day on it.**
    Notifications ARE being delivered; Chrome posts them. The admin alert this
    was found through arrived correctly at 17:47.

    What is lost is cosmetic and one small thing that is not: a Chrome-posted
    notification shows the ORIGIN on the lock screen, where a delegated one
    shows the app's own name and icon. Neither names a condition, so it is not
    a §8 problem — but `loveplusone.app` on a lock screen is more than "⁺One"
    is, and that difference is the kind this app usually spends effort on.

    Worth solving before launch. Not worth solving before a metro opens.

27. **Four things found by testing v4, 2026-09-01.** Signing out is fixed; the
    rest are open and listed in the order they hurt.

    a. ~~**Signing out on one device signed you out on all of them.**~~ — fixed.
    `signOut()` defaults to GLOBAL scope in supabase-js, so the action's own
    docblock — "ends the session and touches nothing else" — was false. The
    link sits at the bottom of every onboarding screen so somebody who just
    handed their phone over can reach it, and that member means THIS phone.
    Now `scope: "local"`, pinned by a test.

    **Signing out everywhere is still worth having**, for a lost phone. It is
    a different button and it does not exist.

    **And it may not be the whole story.** Kevin described it as happening on
    LOGIN, not logout. If it recurs after this, check Supabase → Auth →
    Sessions for **"enforce single session per user"** — that setting does
    exactly what he described and no code change can override it.

    b. **A notification opens the section, not the thing.** A message takes you
    to the inbox rather than to the chat. `NOTIFICATIONS[event].path` is a
    fixed string per event, and `buildPayload(event)` takes no subject.

    **This one needs a decision before it needs code.** The payload type says
    "Deep link path. No identity, no condition, no query string", and
    `assertContentBlind` enforces it. A chat id in the path is an opaque uuid
    and is never displayed — a lock screen shows the title and body, not the
    URL — so the rule's _reason_ does not reach it. But the rule is written
    absolutely, it has a test, and relaxing it is a §8 judgement rather than
    a refactor. Kevin has asked for the behaviour; what needs settling is
    whether the id travels in `path` or in `data`, and whether
    `assertContentBlind` learns the difference.

    c. **The connect sheet does not close after sending.** It refreshes in
    place. The action revalidates and never navigates, so `RouteModal` is
    still open on a form that has already been submitted — which reads as the
    send having failed, and invites a second one.

    d. **A profile shows one photo.** Tapping through to somebody should show
    the whole gallery, blurred where they chose it. Backlog server 17 already
    records the shape of this: the connect panel selects
    `id, display_name, prompts` and nothing else, and calls filtering on an
    attribute that appears on no card "a control with no visible effect".
    Same argument, one surface further in.

    `visible_profile_photos` and the per-photo privacy from 18b already
    decide what may be shown, so this is a read and a render rather than new
    policy.

28. **The other half of the iOS invitation, and a redirect worth questioning.**
    Raised 2026-09-01 by `274cd11`, which fixed the tester-facing symptom in copy
    and deliberately left the mechanism alone.

    **The finding, so it is not re-derived.** An invitation is carried by one
    thing — the `plusone_beta` cookie `proxy.ts` sets on `/beta/<code>`. The
    association file claims `/app/*`, `/i/*` and `/auth/*` and NOT `/beta/*`, so
    an invitation link opens Safari, and the installed app is WKWebView with its
    own cookie jar. A signed-out `/app` redirects to `/onboarding/phone`, the
    gate finds no cookie, and a tester holding a valid invitation is told the
    beta is closed and offered the waitlist they are already on. Android is
    unaffected because a TWA shares Chrome's jar, and that asymmetry is the whole
    diagnosis.

    Two things are left, and neither is urgent now that the copy tells a tester
    what to do.

    - **Claiming `/beta/*` in the components.** Needs NO iOS build — the
      entitlement is domain-level (`applinks:www.loveplusone.app`), so the
      components are served from `apps/web`. It only helps a tester who re-taps
      the invitation AFTER installing, which is the reverse of the order the
      steps give, so it is an improvement rather than the fix. It wants
      verifying in WKWebView, which is the shells lane.

      `waitlist.test.ts` asserts `/beta/*` is absent AND that the iOS copy
      carries the account-first step, so whoever adds the first gets a failure
      pointing at the second. That coupling is the point — do not delete the
      assertion to make the change pass.

    - **Where a signed-out `/app` should land during a closed beta.** It goes to
      `STEP_ROUTES.phone` — the sign-up door, which is the one door the gate
      refuses. Everyone who can actually get through from there arrives with a
      cookie they cannot have in the shell. The population hitting that redirect
      is expired-session members and store reviewers, and `/sign-in` serves both.

      Not changed mid-review, on purpose: `aa6f434` put a `/sign-in` link on the
      form, so nobody is stranded, and moving where every signed-out person
      lands while Apple has the build in front of them is not a drive-by. Worth
      settling once 2.1 is answered.

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
12. **Play's release checklist, which was on no list.** Found 2026-08-27 from a
    screenshot: Monetize with Play says "Finish setting up your app on the
    Dashboard", because the app's setup tasks are not done. None of them is
    tracked anywhere, and together they are the difference between an internal
    testing build and anything a member can install.

    What Play wants: store listing, content rating questionnaire, target
    audience and content, data safety, app access, and a privacy policy URL.
    The last one is already serving.

    **Prepared 2026-08-27 — `apps/android/README.md` is the copy-paste pack.**
    Store listing (name, short and full description, both within Play's limits
    and checked rather than estimated), content rating, target audience, the
    health-apps declaration, ads, and app access are all written out to be
    pasted rather than decided again.

    The two that were never form-filling:

    - **Data safety is done as code.** `packages/config/src/play-data-safety.ts`
      maps every answer from the facts `privacy-labels.ts` already settled, and
      `play-data-safety.test.ts` fails when the two stop agreeing — so the chain
      runs from a new column, through the Apple labels, to both stores. It found
      one thing worth having: **Play has a "processed ephemerally" answer that
      Apple's form does not**, which fits the liveness selfie exactly. So the
      Play side declares it and the Apple side keeps its held-for-counsel note,
      and that is two forms with different resolution rather than a
      contradiction.
    - **App access is still the real problem, and it is now specific.** The
      liveness check turns out NOT to be the barrier — a reviewer account Kevin
      has already taken through onboarding is past it permanently. What is left
      is the sign-in OTP. Supabase Auth has the mechanism (`SMS_TEST_OTP`, a
      number mapped to a fixed code with SMS skipped, and
      `SMS_TEST_OTP_VALID_UNTIL` to expire it) but it is documented under
      SELF-HOSTING and the hosted Phone Login page does not mention it.
      **Deliberately not asserted as a dashboard path** — check Authentication →
      Sign In / Providers → Phone. If hosted does not expose it, this blocks
      submission on both stores rather than delaying a listing, and it wants
      solving before somebody is waiting on a review.

    Still missing and not code: the feature graphic and screenshots, and the
    icon is still item 7's placeholder. Screenshots are cheap now — `adb` is set
    up, so `adb exec-out screencap -p` takes them off the real device.

13. **`wsl --update`**, then re-run `--set-sparse true` and `fstrim`. Reclaims
    ~190 GB the disk image is holding. Tidying, not urgent.

14. ~~**Rebuild the Play subscription as three products**~~ — done
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

15. ~~**A Sandbox tester**~~ — done 2026-08-26, and a purchase went through with nothing charged. Unblocked the last of shells 11.

16. **A Google Cloud service account for Play RTDN.** Server lane 4's remaining
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
      subscription state RTDN does not carry. That access is granted by
      INVITING the service account's email under Play Console → Users and
      permissions. Grant it at APP level, not account level — the labels differ
      between the two tabs and only the app tab keeps it to this one app:

      ```
      App permissions      View financial data
                           Manage orders and subscriptions
      Account permissions  View financial data, orders, and cancellation data
                           survey responses          ← one label, not two
      ```

    The topic name goes in Play Console → the app → **Monetize → Monetization
    setup** → Real-time developer notifications, in the full form
    `projects/{project_id}/topics/{topic_name}`.

    **RESOLVED 2026-08-27 — the whole chain is proven.** Impersonation, Pub/Sub
    read, app access and financial access all confirmed live. The tell that it
    works: `purchases.subscriptionsv2` with a deliberately fake token answers
    **400 "Invalid Value"**, meaning Play accepted the caller and rejected the
    token. While the permission was missing the same call answered 401.

    It took several minutes to propagate after the grant, and a retry is the
    only way to tell that from a misconfiguration — nothing in the console says
    a change is still settling.

    **A 401 here is the PERMISSIONS, not the project link.** I first recorded
    that the Cloud project must be linked at Setup → API access. That is wrong
    and Google's own getting-started page says so in as many words: "You no
    longer need to link your developer account to a Google Cloud Project in
    order to access the Google Play Developer API."

    What the 401 actually means is narrower, and two probes separate it. Calling
    `purchases.subscriptionsv2` with a deliberately fake token returned **401
    "The current user has insufficient permissions"**, while `inappproducts` on
    the same app returned **403 "Please migrate to the new publishing API"** — a
    different refusal entirely, and one that could only come from a caller Play
    already recognises as having access to this app. So authentication works,
    the app association works, and what is missing is the FINANCIAL permission:

    Play Console → Users and permissions → the service account →
    App permissions for Plus One → View financial data
    → Manage orders and subscriptions

    Worth keeping because the message names none of that: "insufficient
    permissions" reads as a broken credential and sends you to the wrong
    console.

    **One choice is stickier than it looks.** RTDN may use a different project
    per app, but the Play Developer API must use the SAME project across every
    app on the developer account. If LuxWeb will ever ship a second app, that
    project is being chosen once for all of them.

17. **The Play catalogue cannot be re-read, and the instruction to re-read it is
    the top of server 13.** Found 2026-08-29.

    Server 13 ends by saying to leave the catalogue overnight and re-read the
    diagnostic before doing anything else. Nobody can: the phone is not
    reachable from WSL. `adb connect 192.168.50.94:44687` gives "No route to
    host" and `adb devices` is empty, which means wireless debugging has been
    switched off — Android does not keep it on across reboots.

    It needs you with the phone in hand, and it is a two-minute job that
    unblocks a diagnosis nobody else can make. Developer options → Wireless
    debugging → on, then **Pair device with pairing code**, and send both
    numbers over. Two traps already paid for: the **pairing port is not the
    connect port**, and both change every time the dialog is opened; and the
    dialog **expires in under a minute**, so the code has to be used
    immediately.

    Worth doing before anything else on Android. Everything under our control
    has been verified correct and Play still returns an empty catalogue, so the
    next reading is the only new information available — and the last one is
    from the 27th.

18. **Two things about the iOS build are unread, and both need App Store
    Connect — which is you.** Found 2026-08-29 by auditing this lane the way
    WSL audited theirs: reading the tree rather than the entry.

    `HANDOFF.md` says twice that these must not go unread, and neither was on
    any list, so nobody was ever going to.

    - **The controlled experiment's answer.** The first Xcode Cloud build
      exists to settle one question: build 5 was refused with ITMS-90111 and
      was built here on macOS 27 beta. If an Xcode Cloud build is ACCEPTED,
      this Mac cannot produce a submittable binary until macOS 27 ships, and
      every future submission goes through Xcode Cloud. If it is refused the
      same way, the toolchain theory is wrong and needs rethinking from
      scratch. Either answer is worth having and neither has been read.
    - **The expanded `Run ci_post_clone.sh script` log.** Three fixes to the
      build number were reasoned out and all three were wrong. Reading that log
      is the one thing nobody has done, and `HANDOFF.md` asks for it explicitly
      before anybody touches this again.

    **These two are deadlocked and that is the thing to know.**
    `CURRENT_PROJECT_VERSION` is a committed floor rather than a mechanism, so
    an Xcode Cloud archive reuses it and dies at "Prepare Build for App Store
    Connect" after a full build — which means the experiment cannot produce its
    answer until the build number is fixed, and the build number should not be
    touched again until the log is read. **Read the log first.** It is the only
    move that breaks the loop, and it costs nothing but the reading.

    A session cannot do either: both live in the App Store Connect web UI. If
    you can paste the expanded post-clone log into a session, that unblocks the
    whole thing.

19. **Apple's Guideline 2.1 reply — the pack is written, three sections need
    you.** 2026-08-29, 6:58 PM. `apps/ios/APP_REVIEW_NOTES.md`.

    **This is not a rejection of the app.** 2.1 "Information Needed" means the
    binary was accepted, passed validation and reached a human, who is asking
    for the App Review Information the Notes field did not contain. Sections 3,
    5, 6 and 7 are written and ready to paste; 1 (screen recording), 2 (device
    list) and 4 (demo access) need you.

    **Section 4 is the real one, and Kevin 12 predicted it.** That item said on
    2026-08-27 that the sign-in OTP "blocks submission on both stores rather
    than delaying a listing, and it wants solving before somebody is waiting on
    a review". Somebody is now waiting on a review.

    The way out is better than the one that entry feared, and it is already
    built: **sign-in accepts an EMAIL as well as a phone**, and
    `verifyOtp({ type: "email" })` takes a six-digit code typed into the app
    rather than a magic link — so `SMS_TEST_OTP` may not be needed at all, and
    neither is a working redirect URL. Two things have to be true and neither
    has been checked: the reviewer account needs an email on it, and Supabase's
    email template must contain `{{ .Token }}` rather than only
    `{{ .ConfirmationURL }}`. Both are dashboard work. Detail in the pack.

    Paste the answers into **App Review Information → Notes**, not only into the
    reply. Apple asks for that explicitly and it is what stops the next
    submission asking the same seven questions.

20. ~~**Can this Mac produce a submittable binary?**~~ — **YES, settled
    2026-09-01.** 1.0 (202609020240) was archived here with
    `/Applications/Xcode-beta.app` on macOS 27 beta, and App Store Connect
    accepted the upload: "Analyzing package" passed and it went to processing.
    ITMS-90111 is an upload-time refusal, so clearing that step IS the answer.

    So the beta-SDK note in `HANDOFF.md` is confirmed — the beta is the
    submission toolchain — and **Xcode Cloud is a convenience rather than the
    only route.** Which retires most of Kevin 18: the controlled experiment does
    not need running, and the `ci_post_clone.sh` build-number log only matters
    if Xcode Cloud is ever the route again.

    The build-number bump is still manual and still a floor. That part of the
    note stands.

21. **ITMS-90111 did not recur, and that is most of Kevin 18's experiment.**
    Inferred 2026-08-29 from the rejection itself rather than from a build log:
    a submission that reaches human review has already passed Apple's upload
    validation, and ITMS-90111 is an upload-time refusal. So whatever toolchain
    produced this build is one Apple accepts.

    **Confirm which build it was before believing the strong version.** If it
    was archived here with `/Applications/Xcode-beta.app`, then this Mac CAN
    produce a submittable binary on macOS 27 beta, the beta-SDK theory in
    `HANDOFF.md` is confirmed, and Xcode Cloud is a convenience rather than the
    only route. If it came from Xcode Cloud, the beta build machine was the
    cause and the note stands as written.

    Either way the toolchain half of Kevin 18 is answered and only the
    `ci_post_clone.sh` build-number log is still worth reading — and that only
    matters if Xcode Cloud is the route.

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
