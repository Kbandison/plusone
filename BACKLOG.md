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

4. **The badge through the plugin.** Android draws `setAppBadge()` as a "1"
   because a launcher badge is numeric; a native shell owns its own badge and
   can show a true dot. See `app-badge.tsx` for why a dot and not a count.
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

11. **StoreKit — the native half is in; the purchase button is not.** Landed
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

    **Still NOT done: no screen calls any of it**, which stays true until a
    purchase has been exercised end to end. `plan-buttons.tsx` renders nothing in
    the shell, which is the honest state rather than a half-wired one.

    Still owed here once the server side exists: the native branch in
    `plan-buttons.tsx`, a submit-on-launch pass over
    `nativeUnfinishedTransactions()` so a grant lost to a dead network is
    recovered, a `restore purchases` control, and an actual purchase exercised
    end to end — which needs a Sandbox tester on the iPad, not a Simulator.

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

13. **The web view does not come back after the keyboard closes.** Found while
    measuring item 12 and NOT fixed, because a workaround built on one beta
    simulator would be worse than the bug.

    `window.innerHeight` drops from 874 to 765 when the keyboard opens, which is
    correct and is what keeps the composer visible. It stays at 765 after the
    keyboard closes. Fixed positioning goes back to resolving against 874, so
    the nav — the app's only navigation — is laid out below the bottom of what
    the member can see, and the composer is clipped by about 30px. Present with
    and without `@capacitor/keyboard`, so the plugin is not the cause and was
    not the cure.

    **Confirm it on the iPad before designing anything.** Two things could make
    it an artifact: the runtime is Xcode 27 beta 6's, and the keyboard was
    dismissed with a programmatic `blur()` rather than by a person. If it is
    real, the shape of a fix is driving the composer and nav from
    `visualViewport` rather than trusting `position: fixed` to be restored —
    which touches layout that was carefully measured on the 25th, and is
    therefore not a change to make on a maybe.

    The probe that produced the numbers is worth rebuilding rather than
    remembering: a copy of the chat screen's composer and nav, a readout pinned
    just above the composer, and measurements taken **after layout settles** —
    a reading during first paint reports a safe-area inset of nought and would
    have been written up as a bug that is not there.

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

11. **Whether the badge should count rather than mark.** Also §8 — see
    `app-badge.tsx`, which argues at length that an app icon sits in front of
    whoever picks the phone up.
12. **`wsl --update`**, then re-run `--set-sparse true` and `fstrim`. Reclaims
    ~190 GB the disk image is holding. Tidying, not urgent.

13. ~~**Rebuild the Play subscription as three products**~~ — done
    2026-08-26, as drafts, with the same ids as Apple. One base plan each,
    and each needs flagging **backwards compatible** before activation.
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

14. **A Sandbox tester**, in App Store Connect under Users and Access. It is the
    only way to put a real purchase through: a Simulator can fetch products —
    that much is verified — but the payment sheet needs a sandbox Apple ID, and
    on the iPad it is signed in under Settings → App Store → Sandbox Account,
    NOT by signing out of the real one. Use an address that is not already an
    Apple ID. Blocks the last of shells 11.

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
