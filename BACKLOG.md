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

1. **A grey band under the status bar, in one combination.** Mostly fixed on
   2026-08-25: the status bar TEXT now follows the page theme, via
   `status-bar-style.tsx` calling the bridge's built-in `SystemBars`. All four
   combinations of system appearance and chosen theme now get legible text.
   What is left is cosmetic and narrower — with the system dark and Linen
   chosen, iOS still lays a grey gradient over the top 62pt of the page (drift
   dropped from 301 to 100, measured). That scrim is not the status bar style;
   setting the style resolves and demonstrably changes the text while the band
   stays. It comes from the view controller's `overrideUserInterfaceStyle`
   following the SYSTEM appearance, which no Capacitor API exposes — it would
   need a small custom native tweak, or the decision that in the shell the theme
   simply follows the system. Worth settling when the theme toggle ships, since
   nothing writes `plusone.theme` yet.

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

10. **Universal links.** Without them a tapped notification, or an emailed link,
    opens Safari — which has its own cookie jar, so it reads as being signed
    out. The Associated Domains entitlement is this lane; the
    `apple-app-site-association` half is the server lane.
11. **StoreKit — the native half is in; the purchase button is not.** Landed
    2026-08-26: `PlusOneStoreKitPlugin` in `apps/ios`, registered by
    `MainViewController`, wrapped for the page by `apps/web/src/lib/native-iap.ts`.
    Verified in the Simulator against the real App Store Connect record —
    products resolve live (`6months` → $69.99, matching `PLANS`), entitlements
    and unfinished transactions resolve empty, a purchase with no product id
    rejects.

    **What is deliberately NOT done: no screen calls any of it.** Pressing buy
    today would take money and grant nothing, because nothing yet verifies a
    transaction or writes `iap_entitlements`. That is the seam below, and the
    UI waits on it — `plan-buttons.tsx` keeps rendering nothing in the shell
    until then, which is the honest state rather than a half-wired one.

    Still owed here once the server side exists: the native branch in
    `plan-buttons.tsx`, a submit-on-launch pass over
    `nativeUnfinishedTransactions()` so a grant lost to a dead network is
    recovered, a `restore purchases` control, and an actual purchase exercised
    end to end — which needs a Sandbox tester on the iPad, not a Simulator.

    Three traps are already paid for and pinned by `shell.test.ts`; the commit
    body for `85315e8` has them in full. The short version is that all three
    fail silently, including a call to an unregistered plugin, which never
    settles rather than rejecting.

12. **Verification debt.** What is left of it: the keyboard against the fixed
    composer (`bottom-[var(--nav-h)]` — the classic WKWebView failure is the
    inset staying applied when the keyboard is up), and the camera, which is the
    liveness gate, needs real hardware, and therefore waits on item 8. Dusk, the
    offline page and both bottom sheets were cleared on 2026-08-25; what Dusk
    turned up is now item 1.

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
4. **Store webhooks.** App Store Server Notifications V2 and Play RTDN, each a
   route handler mirroring the Stripe one, writing entitlements.
5. **Cancellation routing.** Both stores require sending a subscriber to their
   own management screen, so the premium page has to know which source sold the
   subscription.
6. **The double-subscription guard.** Somebody who bought on the web then
   installs the app and buys again. Gate the purchase UI on `is_premium()`
   before it renders.
7. **Account binding — the schema half is done**, 2026-08-26. Unique
   `(store, transaction_id)` refuses a second member claiming one
   subscription, and a trigger refuses an UPDATE moving the owner, because
   `on conflict do update set user_id = excluded.user_id` is the obvious
   webhook upsert and would let a purchase hop to whoever presented it last.
   What is left is the webhook not attempting it — the database will now
   raise rather than comply, so this is a correctness bug waiting rather
   than a security one.
8. ~~**The Stripe path must not be reachable inside the shell**~~ — done by WSL
   in `e8eee7d`. Left here for the record:
   `settings/premium/actions.ts` creates a Checkout session, and offering that
   for a subscription inside an iOS app is guideline 3.1.1 — a hard rejection,
   against a store-billing decision already made on the 24th. Branch it on
   `inNativeShell()`. Small, and independent of items 2–4, so it does not wait
   on App Store Connect.
9. **`/.well-known/apple-app-site-association`**, the web half of shells item 10. A static route on the app's own domain.
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

13. **A Sandbox tester**, in App Store Connect under Users and Access. It is the
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
