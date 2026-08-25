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

1. **The two bottom sheets on iPhone.** `modal.tsx` and `route-modal.tsx` read
   `env(safe-area-inset-bottom)` and were never opened in the shell — `simctl`
   cannot inject a tap. This is the outstanding half of the safe-area check that
   `d4f2a52` finished for the nav and the header.
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
5. **Android TWA.** Bubblewrap or PWABuilder against the manifest, plus
   `/.well-known/assetlinks.json` carrying the signing key's SHA-256. Blocked on
   Kevin for the key. Nothing in `apps/web` changes.
6. **Wire `inTwa()`.** It exists, is tested, and is used nowhere — a TWA has no
   `window.Capacitor`, so `inNativeShell()` and `nativePlatform()` both answer
   no inside a shipped Play app. Wire it when there is a TWA to watch it in, not
   before.
7. **A release Xcode.** `apps/ios` is driven by 27 beta 6 through
   `DEVELOPER_DIR`. Fine for the Simulator, not for a submission build.

## Lane: server and schema (WSL session)

Needs no Apple or Google account, and touches nothing under `apps/ios`.

1. **`apnsNotifier()` and `fcmNotifier()`.** `composeNotifiers()` already runs
   several providers side by side, `push_devices_for` already returns
   `platform`, and `push_subscriptions` already accepts `'ios'` and `'android'`
   with the web-push keys nullable. This is a new implementation behind an
   interface built for it — not a schema change.
2. **`iap_entitlements`, and a third `exists` in `is_premium()`.** The gate
   already unions `subscriptions` with `premium_grants`, so a third source
   changes nothing downstream. **Blocked**: no store products are defined, so
   the columns would be guesswork. Unblocks when App Store Connect has products.
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

## Lane: Kevin

Nothing else can proceed on some of these, so they are roughly in the order they
unblock other work.

1. **Counsel review of the privacy policy and terms** (Decision #30). The last
   item on `verify-launch`'s by-hand list; the other six are done. Both
   documents are marked DRAFT and the terms still say governed by "the law of
   the place we are established" with no jurisdiction named. Long pole — worth
   starting before it is the only thing left.
2. **The signing key's SHA-256**, for `assetlinks.json`. Blocks the whole TWA
   lane item 5.
3. **App Store Connect**: the app record, subscription products, and privacy
   labels. Unblocks server lane items 2–4.
4. **A Resend-verified sending domain**, then set `RESEND_FROM`. Until then
   `emailNotifier` is never constructed and nothing reaches an inbox.
5. **Whether any event should default to email.** The notifier is built and
   inert — every `NOTIFICATION_DEFAULTS` entry is `["in_app", "push"]`. A §8
   decision about a channel that persists and is searchable.
6. **Small Business Program approval.** Separate from the $99 membership and
   usually lands the following month. Until confirmed, the rate is 30% on a
   subscription's first year rather than 15%.
7. **Whether the badge should count rather than mark.** Also §8 — see
   `app-badge.tsx`, which argues at length that an app icon sits in front of
   whoever picks the phone up.
8. **`wsl --update`**, then re-run `--set-sparse true` and `fstrim`. Reclaims
   ~190 GB the disk image is holding. Tidying, not urgent.

---

## Done, so nobody re-opens it

The privacy policy audit (five claims corrected, three guards). Every mechanical
launch gate green against the live database. The email notifier and the
composite that lets providers run side by side. The iOS Capacitor target and the
safe-area fix for the nav and header. Both handoff mechanisms, reconciled to
one.
