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

2. **Native push on iOS.** A WebView has no `PushManager`, so the shell is
   silent today. Needs `@capacitor/push-notifications`, an APNs key from the
   Developer account, and the token registered through `registerPushDevice`
   with `platform: 'ios'`. The column already accepts it.
3. **The native branch in `push-toggle`.** It currently resolves to
   `unsupported` inside the shell, which is honest and temporary — the comment
   at the branch says where the native path plugs in, and that it wants its own
   state and its own line rather than borrowing `pushUnsupported`.
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
8. **Signing is unconfigured.** `CODE_SIGN_STYLE = Automatic` with **no
   `DEVELOPMENT_TEAM`** in `project.pbxproj`, so the target builds for the
   Simulator and nothing else — no device, no TestFlight. Item 2's device test
   and the camera check in item 11 both sit behind it. Needs the Team ID, Kevin
   lane.
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
11. **Verification debt.** What is left of it: the keyboard against the fixed
    composer (`bottom-[var(--nav-h)]` — the classic WKWebView failure is the
    inset staying applied when the keyboard is up), and the camera, which is the
    liveness gate, needs real hardware, and therefore waits on item 8. Dusk, the
    offline page and both bottom sheets were cleared on 2026-08-25; what Dusk
    turned up is now item 1.

## Lane: server and schema (WSL session)

Needs no Apple or Google account, and touches nothing under `apps/ios`.

1. **`apnsNotifier()` and `fcmNotifier()`.** `composeNotifiers()` already runs
   several providers side by side, `push_devices_for` already returns
   `platform`, and `push_subscriptions` already accepts `'ios'` and `'android'`
   with the web-push keys nullable. This is a new implementation behind an
   interface built for it — not a schema change.
2. **`iap_entitlements`, and a third `exists` in `is_premium()`.** The gate
   already unions `subscriptions` with `premium_grants`, so a third source
   changes nothing downstream. **Unblocked 2026-08-26** — the products exist in
   App Store Connect and their real ids are recorded on `PLANS` as
   `appleProductId`: `1month`, `3months`, `6months`. Key on those, not on
   `PlanId`; they are not derivable from it and a helper that builds one by
   string manipulation finds nothing at purchase time. They still cannot be
   submitted for review until there is an app version with a build to attach
   them to — that is Apple's rule, not a setup problem.
3. **Store webhooks.** App Store Server Notifications V2 and Play RTDN, each a
   route handler mirroring the Stripe one, writing entitlements.
4. **Cancellation routing.** Both stores require sending a subscriber to their
   own management screen, so the premium page has to know which source sold the
   subscription.
5. **The double-subscription guard.** Somebody who bought on the web then
   installs the app and buys again. Gate the purchase UI on `is_premium()`
   before it renders.
6. **Account binding.** A StoreKit entitlement belongs to an Apple ID, not a
   Plus One account. Bind `original_transaction_id` to `user_id` at purchase and
   refuse to re-bind, or one subscription unlocks several people.
7. **The Stripe path must not be reachable inside the shell.**
   `settings/premium/actions.ts` creates a Checkout session, and offering that
   for a subscription inside an iOS app is guideline 3.1.1 — a hard rejection,
   against a store-billing decision already made on the 24th. Branch it on
   `inNativeShell()`. Small, and independent of items 2–4, so it does not wait
   on App Store Connect.
8. **`/.well-known/apple-app-site-association`**, the web half of shells item 10. A static route on the app's own domain.
9. **The Android TWA**, moved here from the shells lane on 2026-08-25.
   Bubblewrap or PWABuilder against the manifest — Java and the Android SDK,
   neither of which wants a Mac. `assetlinks.json` is **done** and serving; the
   fingerprint and package name are in it and pinned by a test.

   Build it against **`www.loveplusone.app`**, not the apex. Chrome does not
   follow redirects when it fetches assetlinks, and the apex answers 308 — so a
   TWA pointed there fails verification and keeps its address bar, with nothing
   logged anywhere. Same origin trap that ejected the iOS shell into Safari.

10. ~~**The canonical origin**~~ — settled 2026-08-25. **www**, and both
    `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_APP_URL` now point at it in Vercel
    and in `.env.example`. `app.loveplusone.app` was never attached to the
    project and is out of the iOS allowlist too. Takes effect on the next
    deploy — until then the live build still carries the old values.

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
3. **The Apple Developer Team ID.** One value, and every "needs a real device"
   item on iOS is behind it: shells lane 8, the device half of native push, and
   the camera check that gates joining at all.
4. **App Store Connect**: the app record, subscription products, and privacy
   labels. Unblocks server lane items 2–4. The label answers are worked out and
   kept honest in `packages/config/src/privacy-labels.ts` — copy them from
   there rather than deciding again. One question in it is held for counsel:
   whether the liveness check counts as collecting biometric data when nothing
   is retained.
5. **Whether a remote-URL shell is submittable** (guideline 4.2, minimum
   functionality). Capacitor's own declarations call `server.url` "not intended
   for use in production". The answer is mostly a function of how much native
   capability it has by then, which is what the push and StoreKit work buys.
6. **The app icon and launch image.** Both are placeholder geometry — Claude's,
   not a design. Replacing the SVG in `scripts/generate-icons.mjs` replaces
   every surface at once, web and iOS.
7. ~~**A Resend-verified sending domain**~~ — done 2026-08-25.
   `loveplusone.app` is verified and `RESEND_FROM` is set in Production to
   `Plus One <support@loveplusone.app>` — an address that can actually receive,
   since the domain carries Google Workspace MX. Email goes live on the next
   deploy for anyone who has switched it on; no event defaults to it.
8. **Whether any event should default to email.** The notifier is built and
   inert — every `NOTIFICATION_DEFAULTS` entry is `["in_app", "push"]`. A §8
   decision about a channel that persists and is searchable.
9. **Small Business Program approval.** Separate from the $99 membership, and
   **not a section of App Store Connect** — it is a standalone signed-in page at
   `developer.apple.com/app-store/small-business-program/enroll/`. Looking for a
   "Business" menu item is how an hour goes missing; there isn't one.

   Apple asks three things and no more: be the Account Holder, have accepted the
   latest Paid Apps agreement (Schedule 2, done 2026-08-25), and list any
   Associated Developer Accounts. Tax and banking are **not** prerequisites,
   whatever a search result says. The rate moves from 30% to 15% **15 days after
   approval** — this said "the following month" until 2026-08-25, which came
   from nowhere Apple documents.

10. **Whether the badge should count rather than mark.** Also §8 — see
    `app-badge.tsx`, which argues at length that an app icon sits in front of
    whoever picks the phone up.
11. **`wsl --update`**, then re-run `--set-sparse true` and `fstrim`. Reclaims
    ~190 GB the disk image is holding. Tidying, not urgent.

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
