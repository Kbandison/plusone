# Project Updates

## 2026-08-26 — The shell can reach a phone, and every step of it was silent when it could not

Push works. A notification sent from a laptop arrives on an iPad running the
TestFlight build, and the same send reaches an Android over web push.
Registration, token storage, the settings state and delivery are confirmed on
hardware rather than argued from code.

That matters beyond the feature. Until today the shell had **no notifications at
all** — a WebView has no `PushManager`, so the transport the web app relies on
simply does not exist inside it. It was not degraded there; it was silent. It is
also the strongest available answer to the guideline 4.2 question about whether a
WebView-only app is submittable: the shell now does something a website
categorically cannot.

### Four failures, and not one of them announced itself

**The token had nowhere to go.** iOS hands the device token to the app delegate;
`@capacitor/push-notifications` listens for a matching NotificationCenter post;
the Capacitor template ships an `AppDelegate` implementing neither. So
`register()` succeeded, iOS produced a token, and handed it to a method nobody
had written. The `registration` event never fired and the settings screen said
"that did not work". Everything upstream was already correct — an iOS Team Store
profile granting `aps-environment production`, a matching entitlement, Apple
Distribution signing, the plugin compiled in. Every check passed and the chain
still ended in a missing method.

It could only be found on hardware. The Simulator never gets far enough to
produce a token, so every Simulator check before it passed for the wrong reason.

**The app asked for permission on cold launch.** The first version requested on
mount, and the Simulator showed exactly what that means: the iOS alert on top of
Tonight's Drop, one second after opening, before the member had asked for
anything. iOS shows that alert ONCE for the life of an install — a member who
dismisses it by reflex can never be asked again from inside the app. The asking
moved to the settings toggle, where the member went looking for it and where the
web path has always asked. The load-time component now only refreshes a token
that is already granted.

**The success and an exception arrived together.** The moment push started
working, "Show a test notification" threw `undefined is not an object` onto the
same screen — it draws through a service worker and a WebView has none. Guarded
twice and not offered in the shell: it answers "will this device draw a
notification at all", which iOS had already answered by granting the permission
that got us there.

**The tool for testing push could not test push.** `pnpm push:test` filtered to
`platform === "web"` and skipped an `ios` row in silence, so the only proof
available was waiting for the 8pm Drop. Fixed at the cause rather than with a
second sender: `apns.ts` opened with `import "server-only"`, which throws outside
a React Server Component, so nothing under `scripts/` could import any of it. The
wire — config, the ES256 provider token, the HTTP/2 send — is now
`apns-transport.ts`, which knows nothing about databases or requests.
`apnsNotifier` keeps what needs a server. One implementation, two callers, so the
script exercises the path production uses.

### Getting a build to a device at all

TestFlight needed an upload, and the upload needed three things none of which the
error text names:

- An **App Store archive still requires a registered device**, because automatic
  signing builds an iOS App Development profile first whatever you are archiving
  for. This corrects what was said here twice.
- **`xcodebuild` uses registered devices and never registers one.** Plugging the
  iPad in and building for it says "isn't registered in your developer account"
  and stops.
- **Developer Mode does not appear in iOS Settings** until a Mac running Xcode
  has connected to the device once. Before that every device command fails with
  "Developer Mode is turned off", which reads like a setting somebody forgot
  rather than one that was not there yet.

Three builds went up. The commands are in `apps/ios/README.md`, including that
`destination: upload` sends through the Apple ID already in Xcode — no API key,
no Transporter.

### One thing that is probably dead work

`fcmNotifier()` has been in the server lane since the notify work landed. It is
likely unnecessary: Android is a TWA, not a Capacitor app, and **a TWA registers
an ordinary web push subscription** — `native-shell.ts` says so, and it is why
`push_subscriptions.platform` stays `'web'` for one. Web push already reaches
Android and was seen doing it today. FCM would only be needed if Android became a
native shell, which the 2026-08-24 decision ruled out. Recorded rather than
built.

### And main was red for one commit

`9ae1481` went out with a failing lint — not because the check was skipped, but
because the commit was chained after it with `;` instead of `&&`, so the failure
scrolled past. That is verbatim what CONTRIBUTING warns about, in the section
that warns about it because it happened once before at `e6749ca`. Second time,
same mechanism. Fixed in `71fc4f2`.

### Shells

Verified against **iOS / WKWebView** on an iPad Pro through TestFlight, and
against **Android** over web push. The residual grey status-bar band from
yesterday is unchanged and still needs `overrideUserInterfaceStyle`.

## 2026-08-25 — One origin, and the email that was about to ship dead links

Email is on and the origin split is closed. The second was found by trying to do
the first, which is the useful part of the story.

**`RESEND_FROM` is set.** The domain was already verified — checked against
Resend's own API rather than taken on trust — and the sender is
`Plus One <support@loveplusone.app>`. Deliberately an address that can receive:
`loveplusone.app` carries Google Workspace MX, so a member who replies to a
notification reaches somebody instead of a bounce. `emailNotifier` is
constructed on the next deploy; no event defaults to email, so nothing reaches
an inbox that has not asked for it.

**And it would have shipped dead links.** Every message `email.ts` builds ends
with `${appUrl}${payload.path}`, and `NEXT_PUBLIC_APP_URL` was
`https://app.loveplusone.app` — a host that resolves to Vercel with no
deployment attached and answers **404**. Turning email on without noticing would
have put a broken link at the foot of every notification, and the same value is
Stripe's `success_url`, the add-an-address email target, and what a room share
link is built from.

### The origin, settled

`www` is canonical. Both `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_APP_URL` now
point at `https://www.loveplusone.app`, in Vercel and in `.env.example`.

It is worth writing down what the split actually cost, because it read as
cosmetic each time and was not:

- The **iOS shell** ejected a member into Safari mid sign-in. Capacitor hands
  any navigation outside `server.url`'s host to the system browser, and the apex
  308s to www.
- **assetlinks.json** would have failed verification silently. Chrome does not
  follow redirects fetching it, so a TWA pointed at the apex keeps its address
  bar forever with nothing logged.
- **Stripe** would have returned a subscriber to a 404.
- **Email** was about to do the same to every notification.

Four failures, one cause, and three of them silent. The apex can still be made
canonical later — it would have to SERVE rather than redirect, and the shell's
`server.url` would move with it — and `.env.example` now says so.

`app.loveplusone.app` is also out of the iOS `allowNavigation` list. It was
there against the day it started serving; it never did, and an allowlist entry
for a host that answers nothing is a claim that ages badly.

### One thing to know about the Vercel CLI

`vercel env add` defaults to secret visibility, and a `NEXT_PUBLIC_` variable
cannot be secret on Production or Preview — it ends up in the client bundle by
definition. The add failed, and because the remove had already succeeded, both
variables were briefly absent. `--no-sensitive` is the flag. They are back, and
now correctly marked Non-sensitive rather than Sensitive, which is what they
always should have been: marking a value Sensitive when it ships to every
browser buys nothing and is why `vercel env pull` could not fetch them onto this
machine in the first place.

The live site was never affected — environment values are baked at build time,
so the running deployment kept working throughout and picks the new ones up on
the next deploy.

### Shells

`apps/ios/capacitor.config.ts` changed, so **iOS is affected and unverified** —
only an allowlist entry was removed, for a host that serves nothing, and the
tests pin the two that remain. **Android/TWA** is unaffected; assetlinks already
targets www.

## 2026-08-25 — The status bar follows the theme, and most of the band goes with it

The grey band found earlier today is mostly gone, and the part that is left has
a different cause from the one the last entry named.

**The fix.** `status-bar-style.tsx` watches `data-theme` on the root element and
tells the native bar which way the page is dressed. All four combinations of
system appearance and chosen theme now get legible status bar text: dark on
Linen, white on Dusk, whatever the phone is set to.

Three things about it are worth keeping.

**The names describe the background, not the text.** Capacitor's `DARK` is
documented as "light text for dark backgrounds", so Dusk takes `DARK` and Linen
takes `LIGHT`. Read as text colours they are exactly inverted — and inverting
them fails silently, producing white-on-cream and black-on-near-black, which is
the original bug with worse contrast. `status-bar-style.test.ts` pins the
mapping for that reason and says so.

**`SystemBars` is already in `@capacitor/ios`.** `@capacitor/status-bar` was
installed first, and it drives the identical `bridge.statusBarStyle` through the
identical code path — a dependency bought for nothing. Removed. Worth checking
core before reaching for a Capacitor plugin.

**A remote page can call native without bundling anything.** The injected bridge
defines `Capacitor.nativePromise(plugin, method, options)` alongside `toNative`
and `nativeCallback`, so `apps/web` calls a native plugin with no
`@capacitor/core` anywhere in its dependency tree. An earlier note in
`BACKLOG.md` said the web half of this fix "has nowhere to live"; that was
wrong, and wrong in a way that mattered — it made every remaining plugin item
look harder than it is. The badge and the web half of push go the same way.

The call is guarded twice: `inNativeShell()`, and a caught rejection. The shell
loads this app over the network, so `apps/web` and `apps/ios` ship on completely
different clocks — a web deploy reaches shells built before any of this existed
and which will never have it. An old shell has to degrade to a wrong status bar,
never to a broken page.

### What is left, and why it is a different thing

With the system dark and Linen chosen, iOS still lays a grey gradient over the
top 62pt. Measured, the drift between the top of the screen and the page below
it fell from **301 to 100** — better, not gone.

That band is **not** the status bar style, and the last entry was wrong to imply
it was. Setting the style resolves and demonstrably changes the text — the clock
goes from white to black — while the band stays exactly where it was. Proved by
painting the page red: the band came back as dark red fading to bright red, so
it is a scrim over the app's own content rather than the WebView's background
showing through.

It comes from the view controller's `overrideUserInterfaceStyle`, which follows
the SYSTEM appearance and which no Capacitor API exposes. Fixing it needs a
small custom native tweak, or a decision that inside the shell the theme simply
follows the phone. That is worth settling when the theme toggle ships rather
than now — nothing writes `plusone.theme` today, so the divergence is reachable
only by setting the key by hand, which is how both halves of this were
demonstrated.

### Shells

Verified against **iOS / WKWebView** — Simulator, iPhone 17 Pro, iOS 27.0, all
four appearance/theme combinations, against a local dev server. **Android / TWA
unverified.** The component is web-side and will reach the TWA, where
`inNativeShell()` is false by construction — a TWA has no `window.Capacitor` —
so it should return before doing anything. Should. Nobody has looked.

## 2026-08-25 — The rest of the safe-area check, and the status bar that argues with the theme

The two bottom sheets are done, and so is the reason they were not. `simctl`
cannot inject a tap, which is where this stopped on the last pass — but
Capacitor sets `isInspectable` on DEBUG builds, so the shell's WKWebView can be
driven over WebKit's remote debugging protocol through
`ios-webkit-debug-proxy`. That turns the whole surface from something that can
only be screenshotted into something that can be measured and operated.

**The insets, read from the engine rather than counted off a PNG.** On an
iPhone 17 Pro: `env(safe-area-inset-top)` is **62px**, `-bottom` is **34px**,
left and right nought in portrait. The nav's computed `padding-bottom` is
**exactly 34px** and its bottom edge sits flush with the viewport, which is the
direct form of what the last entry inferred from pixel arithmetic. The header
fix from `d4f2a52` computes to **78px** — 1rem plus the 62 — in the shell.

**Both sheets clear the home indicator, measured at the state that matters.**
They are scroll containers, so their padding sits at the end of the content
rather than as a fixed gap; mid-scroll content passing under the indicator is
correct behaviour, and the real question is where the last control ends up.
Scrolled to the bottom:

| sheet             | padding-bottom     | lowest control | clearance |
| ----------------- | ------------------ | -------------- | --------- |
| `route-modal.tsx` | 74px (2.5rem + 34) | "Send connect" | **75pt**  |
| `modal.tsx`       | 58px (1.5rem + 34) | close button   | **59pt**  |

Both against a 34pt indicator. One caution worth keeping: the first `modal.tsx`
reading said 33.1pt and `clearsHomeIndicator: false`. That was taken immediately
after `showModal()`, with the sheet still 24px below the viewport mid-animation.
Three seconds later it was flush and correct. A measurement taken during a
transition is not a measurement.

**Dusk renders correctly** — ground `#14110f`, ink `#ede7de`, white status bar
text, the header clear of it.

**The offline page renders.** `server.errorPath` was wired on the 25th and had
never been made to fire; pointing the shell at a host that does not resolve
brings up "No connection" with the mark, the copy and a working Try again.

### What it found: the status bar contradicts the member's theme

iOS decides the status bar style from the **system appearance**. The app decides
its palette from the **member's stored choice**, which the theme script prefers
over `prefers-color-scheme`. Nothing keeps those two in step, and when they
disagree the result is not merely wrong — iOS compensates by dimming the app's
own content.

On a dark system with Linen chosen, the top **62pt** of the page carries a grey
scrim, fading from `rgb(140,137,130)` at the top edge to Linen exactly at the
safe-area inset. That is iOS applying light-content text and then darkening
whatever is behind it to keep the text legible. A cream page with a dirty grey
band across the top.

The mirror case is fine — Dusk under a light system still gets white text and no
scrim — so this only bites the member who has chosen the theme their phone is
not set to, which is precisely the member who chose deliberately.

Not fixed here. It needs `@capacitor/status-bar` and a bridge from the web
theme to the native style, and the web half of that has nowhere to live yet. It
is now item 1 in the shells lane, with the measurement attached. It is shell
only: the installed web app sets `statusBarStyle: "default"` and never sees it.

### The seed script, finished

The last entry fixed the NULL token columns and `phone_confirmed_at`. That was
still not enough to sign in as a seed: `hasHealthConsent` is a row in its own
table and the seeder never wrote one, so a member complete in every other
respect was returned to the consent step forever. It writes one now, reading
`CONSENT_COPY_VERSION` from `packages/config` rather than hard-coding the date —
the resolver counts a consent only when its `copy_version` matches the current
wording, so a written-down date would go on looking right and quietly stop
counting the day the copy changed.

Proved end to end: four seeded members, all four signing in and reaching `/app`.
Removed afterwards, `check:seed` green.

### Shells

Verified against **iOS / WKWebView** — Simulator, iPhone 17 Pro, iOS 27.0.
**Android / TWA unaffected and unverified**; nothing here changes `apps/web`
except the seed script, which no shell reads.

### Held for Kevin

Unchanged from the entry below, except that the safe-area check is off it. The
list lives in `BACKLOG.md` now, under **Lane: Kevin** — the Apple Developer Team
ID is the cheapest item with the widest blast radius, and counsel review of the
policy and terms is the long pole.

## 2026-08-25 — The safe-area check, finally done, and what it found

The check that has been top of Held for Kevin since the 24th is done. It needed
a signed-in session on a notched iPhone, which needed the database URL, which
needed most of what is below.

**The bottom edge is correct, and now measured rather than believed.** The nav
was screenshotted in the shell on an iPhone 17 Pro and an iPad Pro 11", and the
gap between the last drawn pixel of the active tab and the physical bottom of
the screen came out:

| device        | scale | clearance          | inset | remainder |
| ------------- | ----- | ------------------ | ----- | --------- |
| iPhone 17 Pro | @3x   | 120px → **40.0pt** | 34pt  | 6pt       |
| iPad Pro 11"  | @2x   | 52px → **26.0pt**  | 20pt  | 6pt       |

The remainder is identical on both and equals the `<ul>`'s `py-1.5`. The part
that moves is exactly `env(safe-area-inset-bottom)` for each device. That is the
proof the single-device screenshot could not give: the padding is being read
from the engine per device, not hard-coded, not zero, and not doubled — a
doubled inset would have put the iPhone at 74pt, which is what `contentInset`
being anything other than `never` would have caused.

**The top edge was wrong, and only in the shell.** `/app`'s header is
`pt-4` and nothing else, so in the iOS shell — where the WKWebView _is_ the view
controller's root view and the page starts at the physical top of the screen —
the wordmark was drawn **underneath the status bar clock**. "⁺One" came out as a
grey smudge behind "13:27".

Nothing else could have shown it. A browser tab has Safari's chrome above the
page. The installed web app sets `statusBarStyle: "default"`, which is precisely
the setting that makes iOS start the web view below the status bar — chosen back
when the manifest was written, for exactly this reason, and it is why the PWA
was fine. Both report a top inset of nought.

The header now reads `pt-[calc(1rem+env(safe-area-inset-top))]`, the same shape
the nav and the two sheets already use at the bottom. It adds nothing on any
surface that reports no inset, so only the broken one changes. Verified in the
Simulator against a local dev server: the wordmark clears the clock and is
legible.

**Still not checked: the two bottom sheets.** `modal.tsx` and `route-modal.tsx`
both carry `env(safe-area-inset-bottom)` and both need a tap to open. `simctl`
has no way to inject one, so they were not exercised. They are written the same
way the nav is, which the nav's numbers now vindicate — but that is an argument,
not a measurement.

### Three defects found on the way in

**`allowNavigation` was wrong in the shell shipped this morning.** Capacitor
decides what stays inside the WebView with two rules, and both are narrower than
they look. `shouldAllowNavigation` splits host and pattern on dots and refuses
to compare them at all unless the counts match — so `loveplusone.app` matches
the apex and _nothing beneath it_. The fallback is
`navURL.absoluteString.starts(with: serverURL.absoluteString)`: a prefix test on
the **whole string**, not on the host. It covered `www` only because `server.url`
happened to be exactly the origin with no path.

Found by giving `server.url` a path — the auth callback — at which point every
other page on the same host stopped matching and iOS threw the session into
Safari mid-sign-in. `app.loveplusone.app` was never covered either, and that is
where `NEXT_PUBLIC_APP_URL` points: Stripe's return URL, the add-an-address
email, and room share links. All three hosts are now named.

**`app.loveplusone.app` answers 404.** It resolves to Vercel with no deployment
attached. `NEXT_PUBLIC_APP_URL` is set to it, so a member finishing Stripe
checkout on the web is currently returned to a 404. Web-side and pre-existing;
not touched here.

**`seed-test-members.mjs` poisons Supabase Auth for the whole project.** It
inserted `auth.users` rows leaving `confirmation_token`, `recovery_token`,
`email_change` and `email_change_token_new` NULL. GoTrue is Go and scans those
into plain strings with no null handling, so **one** such row makes
`auth.admin.listUsers()` fail for every caller — it reads all users — with
"Database error finding user", and `generateLink()` fails on that member too.

That error is already in the record: `dev/sign-in/actions.ts` met it head-on and
worked around it by dropping `listUsers`. The workaround was right and the
diagnosis stopped one layer short of the cause. It was the seeds all along.
Fixed at the source, with `phone`/`phone_confirmed_at` set too — the onboarding
resolver reads `phone_confirmed_at` off `auth.users`, so a seeded member with a
complete profile was still sent back to step one on sign-in. The phone is
derived from the member's uuid under NPA 555, which the NANP does not assign, so
it can never reach a handset and cannot collide between runs.

### Two things about this machine

**`check:seed` had been red.** 24 seeded members were sitting in the production
database when this session started — the gate that exists so "we forgot to clean
up" cannot be a silent state had been failing, unnoticed, because it is not one
of the five CI runs and needs a credential CI does not have. They are gone and
the gate is green. Three `@dev.invalid` members from `/dev/sign-in` remain; no
gate covers those.

**The database is only reachable through the pooler.**
`db.<ref>.supabase.co` has an AAAA record and no A record, and this network has
no IPv6 egress, so the direct connection string from the dashboard fails with
ENOTFOUND. `.env.local` now uses the session pooler at
`aws-0-us-west-2.pooler.supabase.com:5432`. `.env.example` had said either would
do; it now says which.

**`pnpm dev` could not read `.env.local`.** README's quickstart puts it at the
repo root, and Next reads it from `apps/web/`, so the dev server came up with no
environment and every page threw. Symlinked for now — `apps/web/.env.local` →
`../../.env.local`, one source of truth, and gitignored either way. The README
still says the wrong thing and is left for Kevin, because which of the two
locations is meant to be canonical is his call.

### Shells

Verified against **iOS / WKWebView** — Simulator, iPhone 17 Pro and iPad Pro 11",
iOS 27.0. **Android / TWA is unverified.** The header change is web-side and will
reach the TWA, where it should be inert: Chrome in a TWA reports a top inset of
nought and the calc adds nothing. Should be. Nobody has looked.

### Held for Kevin

- **The two bottom sheets**, which need a tap the tooling cannot give.
- **`NEXT_PUBLIC_APP_URL` pointing at a 404**, and whether the apex or `www` is
  the canonical origin — `NEXT_PUBLIC_SITE_URL` still says the apex, which 308s.
- **Whether a WebView-only shell is the shape to submit** (guideline 4.2).
- **A released Xcode** before anything is uploaded; this is 27 beta 6.
- **Rotating the database password**, still, and now more so — it has been
  handled on two machines today.
- **Small Business Program approval**, **a Resend-verified sending domain** then
  `RESEND_FROM`, **whether the Drop should default to email**, and **the signing
  key fingerprint** — carried forward unchanged.

## 2026-08-25 — The iOS target exists, and the check it was built for still does not

The shell builds, installs and launches. `app.loveplusone` is on a simulated
iPhone 17 Pro running iOS 27, loading the live site into WKWebView, with the
project's own mark on the home screen. What it has **not** done is the thing it
was stood up for — read the last section before assuming otherwise.

### The machine first, because none of it worked

The MacBook was a fresh clone and four separate things were in the way. None of
them is interesting on its own; together they are most of why this took as long
as it did, and every one of them will be in the way again on the next machine.

- **Node was 20.5.1** against an `engines` floor of 20.9, and worse, the
  Homebrew build of it was broken outright — it linked `libicui18n.73.dylib`,
  which no longer exists on this OS, so `npm` itself died on launch. `node@22`
  is installed keg-only with a PATH line in `~/.zshrc` (the previous file is at
  `~/.zshrc.bak-plusone`).
- **Homebrew did not know macOS 27** and refused to load at all — it was pinned
  at 4.2.2, which predates the version. Repaired by fetching its own git repo
  forward, which is the documented fix and the only one available when `brew`
  cannot start.
- **Xcode was downloaded but never unarchived.** `Xcode_27_beta_6.xip` had been
  sitting complete in `~/Downloads` since 01:15, and a half-finished extraction
  from a previous attempt was sitting beside it. Completeness was checked
  against the archive's own table of contents rather than guessed at — 1.99 GB
  is the real size now, not a truncation.
- **A modern Xcode ships with no simulator to run.** The 1.99 GB is a shell:
  the iOS SDK is in it, a bootable iOS image is not. `xcodebuild
-downloadPlatform iOS` is a second download several times the size of the
  first, and nothing says so until `simctl list runtimes` comes back empty.

It is Xcode **27 beta 6** on a beta macOS, which is fine for the Simulator and
is not fine for submission — App Store Connect takes builds from released
Xcodes outside a transition window.

### What was decided

**Swift Package Manager, not CocoaPods.** Capacitor 8 flipped its default and
`cap add ios` produces an SPM project unless told otherwise. CocoaPods is
installed on this machine and unused; nothing here needs a Podfile.

**`server.url` is `https://www.loveplusone.app` — the www, not the apex.** The
apex answers 308 to www, and Capacitor hands any navigation outside
`server.url`'s host to the **system browser**. Pointed at the apex, the launch
navigation itself would have thrown the member into Safari before they saw the
app, and it would have looked like the shell simply did not work. The apex is in
`allowNavigation` so a link written against it stays inside.

That leaves a loose end on the web side: `NEXT_PUBLIC_SITE_URL` is the apex.
Every absolute URL the app builds — auth callbacks included — is therefore an
origin that redirects. It costs a hop today rather than being broken, so it is
recorded here rather than changed; picking a canonical origin is a decision with
a blast radius (sessions, push endpoints, the OAuth allowlist) and it is not
one to make on the way past.

**`contentInset: "never"`.** Already Capacitor's default, and written down
anyway with the reason, because it is the single setting that decides whether
the safe-area work in `apps/web` is right or doubled. Anything else lets UIKit
add its own inset for the notch and the home indicator **on top of** the
`env(safe-area-inset-*)` padding the CSS already applies — the nav would float a
home indicator's height above where it belongs and nothing about the CSS would
look wrong.

**Portrait, on iPhone.** `manifest.ts` has said `orientation: "portrait"` since
it was written and iOS is the one platform that ignores it, so this is an
existing decision finally reaching the surface it was meant to cover rather than
a new one. It is also what keeps the safe-area work honest: everything the app
reads is `env(safe-area-inset-bottom)`, nothing anywhere reads `-left` or
`-right`, and those are 59pt in landscape on a notched iPhone. iPad keeps all
four — no notch, no hazard, and Apple reads a rotation-locked iPad app as a
phone app.

**Camera and microphone purpose strings.** Not a nicety: iOS **terminates the
process** the instant `getUserMedia` asks for a device with no string declared.
The camera one gates the liveness check, which gates joining at all — without it
the app dies partway through onboarding, on every device, for everybody. Both
are condition-blind (§9.6), because a permission alert is drawn over whatever is
on screen and is exactly the kind of thing read over a shoulder.

**The icon and launch image come from `generate-icons.mjs`**, not from a PNG
dropped into the asset catalogue. Same mark as the web icons, same placeholder
status, and one place to replace when Kevin's design lands. Two things there are
not obvious: App Store Connect rejects a 1024 icon carrying an alpha **channel**
even when every pixel is opaque, so it is flattened and checked; and the launch
image's mark is drawn at 0.11 of the canvas rather than the icon's 0.58 because
the storyboard scales it `aspectFill` into a phone-shaped view and crops away
everything outside the middle ~46% of the width.

`apps/ios/shell.test.ts` pins all of it, in the source-reading style
CONTRIBUTING describes. The reason is specific: `npx cap add ios` run a second
time restores Capacitor's own Info.plist over this one and says nothing, and
Xcode rewrites an asset catalogue whenever it is touched. Nothing else in the
repository would notice.

### What this shell actually is, said plainly

It loads the live site into a WebView. It does not bundle the app, because there
is no bundle to make — `apps/web` is server-rendered with server actions and a
cookie-bound session, and none of that survives being served off a filesystem.

Capacitor's own type declarations mark `server.url` **"not intended for use in
production"**. That is a caution about App Store review — guideline 4.2, minimum
functionality — rather than about anything breaking, and the honest answer today
is that the mitigation does not exist yet: the shell has no native capability of
its own. Push is not wired, StoreKit is not wired. An app that is a WebView and
nothing else is the shape 4.2 is aimed at.

### The safe-area check was NOT done

This is the item that has been at the top of Held for Kevin for two days and it
is still there.

The shell renders the marketing pages correctly — the page ground runs under the
status bar, which is `viewport-fit: cover` and `contentInset: never` doing what
they should. But every element the safe-area work is about is **behind
authentication**: the bottom nav lives in `/app/layout.tsx`, and the two bottom
sheets go with it. Public pages have nothing pinned to the bottom edge, so
nothing on them can prove the thing that matters.

`pnpm seed` cannot run either, and the first version of this entry got the
reason wrong: `SUPABASE_DB_URL` is not a Vercel value at all. `vercel env ls`
does not list it, because nothing in `apps/web` reads it — it is the Postgres
connection string, used only by the scripts that talk to the database directly,
and it has never been in this repository. It is now documented in
`.env.example`, which claims to document every key and did not.

So: **the nav, `modal.tsx` and `route-modal.tsx` have not been looked at on a
notched iPhone.** They are written correctly as far as reading them goes. That
is not the same claim and this entry will not make it.

### Shells

Verified against **iOS / WKWebView** — Simulator, iPhone 17 Pro, iOS 27.0, build
and launch only. **Android / TWA is untouched and unverified**; nothing in this
change is shared with it, which is the point of the split.

### Held for Kevin

- **The iPhone safe-area check**, still. It needs a signed-in session: either
  `SUPABASE_DB_URL` so `pnpm seed` can put marked test members in and
  `pnpm seed:remove` can take them out again, or two minutes signing in by hand
  in the Simulator.
- **Whether a WebView-only shell is the shape to submit**, given 4.2 and given
  that nothing native is wired yet.
- **A released Xcode**, before anything is uploaded.
- **Small Business Program approval**, **a Resend-verified sending domain** then
  `RESEND_FROM`, **whether the Drop should default to email**, and **the signing
  key fingerprint** for `/.well-known/assetlinks.json` — all carried forward
  unchanged from the entry below.

## 2026-08-25 — Three gaps closed, and a name that stopped being harmless

**Decision #10 has a mechanism now.** "Intention weighting tightens as density
grows — config-driven" had been in §6.1 from the start with nothing behind it:
`dropConfig()` hot-read four fixed weights, `minPool` drove only the radius
ladder, and a hand on a dial was the entire implementation. Defensible at launch
where there is no population to tune against; not defensible the day a metro
fills and a `long_term` member is still shown `casual` profiles at 0.3 affinity
because nobody moved the number.

`weightsForPool()` climbs intention from its configured weight to a ceiling as
the pool grows from `minPool` to `saturationPool`, clamped both ends. Only
intention moves — `score()` normalises by the weight total, so raising one
weight _is_ shifting the mix, and touching the others would rescale every score
instead. Three guards worth not removing later: it reads the pool the ladder
**settled on** rather than everything eligible, because a thin area that climbed
to 250 miles has not become dense by climbing; it returns the base object by
identity below `minPool`, so every area at launch scores exactly as it did
before this existed; and it never loosens, because an admin who sets the ceiling
under the launch weight through §7.3 has misconfigured it and honouring that
would make the densest places serve the worst matches. `DropResult.weightsUsed`
reports what a drop actually scored with — a mechanism that adjusts itself
invisibly is one nobody can check.

**Everybody who never granted push was being reached by nothing.** `notify()`
asked `notify_member` which channels survive a member's switches, kept the push
cohort, hard-coded `["push"]`, and **returned early when that list was empty**.
The settings screen has had an Email column for as long as it has had a Push
one. Their preferences were read and then discarded, and nothing about the
screen said so. Push is opt-in, plenty of people will never grant it, and on iOS
it is not offered at all until the app is on a home screen.

Four pieces, three of which fit seams that already existed. `composeNotifiers()`
replaces choosing a provider with running all of them — `notifier()` returned
web push _or_ the stub, which assumed one transport reaches everybody, and the
native shells will each want a provider _beside_ the web one rather than instead
of it. `emails_for()` reads `auth.users`, which owns the address, confirmed
addresses only so a typo cannot put ⁺One in a stranger's inbox, and with no
grant to `authenticated`. `emailNotifier()` posts **plain text** to Resend's
batch endpoint a hundred at a time — no HTML, and that is the point rather than
laziness: a remote image is how transactional mail learns it was opened, and
clients that proxy images move who sees that signal rather than removing it.

Note what it does **not** do: no event defaults to email. Every
`NOTIFICATION_DEFAULTS` entry is still `["in_app", "push"]`, so nothing reaches
an inbox unless a member switches it on. Whether the Drop should default to
email is a §8 question about a channel that persists and is searchable.
`RESEND_FROM` is also unset, so the notifier is not built — it needs a
Resend-verified sending domain.

**`BRAND.legalName` was "YourPlusOne"**, derived from `yourplusone.app`, a domain
that was never bought. Harmless while nothing rendered it. It stopped being
harmless when the store decision landed, because an App Store listing carries
the seller's legal entity publicly. Kevin confirmed it on enrolling in the Apple
Developer Program: the entity is **LuxWeb Studio LLC**, the app is PlusOne.

**`CONTRIBUTING.md` described a different project.** Branches off main, pull
requests, squash merges, CODEOWNERS, a CHANGELOG, semantic-release tagging, an
~80% coverage target, and testing conventions for Python and Go. It now
describes what actually happens, including the warning that earned its place —
do not chain a commit after the checks in one shell line without gating on the
result. That happened at `e6749ca` and left `main` red for one commit.

### Where the shells stand

Apple Developer Program is paid ($99) as of 2026-08-25, and the project is
cloned to a MacBook. Vercel marks some values Sensitive and those are
write-only, so `vercel env pull` could not fetch them — `.env.local` was carried
across by hand.

### Held for Kevin

- **Small Business Program approval**, which is a separate application from the
  $99 membership and usually lands the following month. Until it does, the rate
  is 30% for a subscription's first year rather than 15%.
- **Whether the Drop should default to email.** The mechanism is built and inert
  until an event lists the channel.
- **A Resend-verified sending domain**, then `RESEND_FROM`.
- **The iPhone safe-area check**, now possible in Xcode's Simulator and the last
  launch-blocking verification. An iPad does not exercise `viewport-fit: cover`.
- **The signing key fingerprint** for `/.well-known/assetlinks.json`.

## 2026-08-24 — Two shells, and a current iPad that will not say it is one

The app is going to the stores. Three decisions were made to get there and one
bug was found on the way, and the bug is the interesting part.

**Hybrid, not one Capacitor project.** Android gets a Trusted Web Activity, iOS
gets Capacitor. Kevin's case for a single Capacitor covering both was bug
surface — one place to fix things, so a fix on iOS could not be silently missed
on Android. Right worry, wrong premise: Capacitor runs two engines as well,
because Android WebView is not WKWebView, and the WebKit divide that causes
these bugs survives either choice. It unifies tooling, not rendering. A TWA is
_real Chrome_ — the engine already tested against — so the hybrid keeps Android
on the known-good target and confines the unfamiliar runtime to iOS, where there
is no alternative. It also keeps web push, which works today and which Capacitor
on Android would replace with FCM for nothing gained.

That leaves a process risk rather than an architectural one, so `AGENTS.md` now
carries a standing rule: anything touching what a shell can see is not done
until it has been checked against both, and the commit says which.

**A public store listing is worth its disclosure.** Both stores require
declaring health-data handling on a public listing page, against a product whose
own manifest description deliberately says nothing about who it is for. Kevin's
call, and the better argument: absence from the stores is not read as
discretion, it is read as unvetted. This app asks strangers to upload a face
scan and disclose a diagnosis. Category, description and much of the
privacy-label granularity are still controllable; member reviews are not.

**Store billing on both, at 15%.** Apple's US storefront would allow linking out
to Stripe at about 2.9% — guideline 3.1.1(a), no entitlement needed since the
May 2025 rewrite that followed the Epic ruling — but it is a US-only carve-out
that vanishes the day a second storefront opens. One touch against saved
credentials also converts better than sending somebody to a browser to type a
card, which is not free either. Play Billing is required for subscriptions
regardless, and the policy names _dating_ in its own examples. Alternative
billing was ruled out: 11% plus a processor is about 13.9%, a point of saving
for the integration work and the chargeback risk.

Two things worth keeping. The rate is 15%, **not** 15 plus processing — the
store is the processor, and Stripe's fee applies only to web subscriptions. And
Apple's 15% is not automatic: the **Small Business Program must be applied for**,
or the first year of every subscription is 30%.

**The bug.** Both settings screens asked
`/iPad|iPhone|iPod/.test(navigator.userAgent)`, which has not been a reliable
question since iPadOS 13. Safari browses desktop-class by default there and
reports a Macintosh string with no "iPad" in it, so on a current iPad that test
is false and both screens take a branch written for a desktop browser.
`push-toggle` tells somebody one share-menu gesture from notifications that
notifications are not available; `install-app` waits out a 1500ms grace period
for a `beforeinstallprompt` Safari will never fire, then offers a line about
their browser's menu instead of naming the share button. On the platform where
installing is the precondition for push, that is the wrong sentence twice.

`isAppleMobile()` keeps the user-agent test and adds the pair that still
answers — `maxTouchPoints` against `platform`, five against nought. It only
widens, so the paths already verified on hardware cannot move.

`inTwa()` closes the other gap `AGENTS.md` names: `inNativeShell()` and
`nativePlatform()` look for `window.Capacitor`, and a TWA has none. The
subtlety is that `document.referrer` is `android-app://` only on the **launch**
navigation, so the naive one-liner answers yes on arrival and no on the next
screen. Cached per tab, and the cache is optional because `sessionStorage`
throws rather than returning null when storage is blocked.

### Held for Kevin

- **The iPad check.** Open the site in a Safari _tab_ on the iPad, not the
  installed app, and read the notifications section. "Add ⁺One to your home
  screen first" means `isAppleMobile()` is working. "Notifications are not
  available here" means it is not.
- **Apple's Small Business Program application.** 15% versus 30%, not granted
  automatically, and the cheapest item on the list.
- **The signing key's SHA-256**, for `/.well-known/assetlinks.json`. Nothing can
  be built for Play without it.
- **A Mac decision.** Xcode is macOS-only; Kevin has a 2022 MacBook Pro, which
  also brings the iOS Simulator — real WebKit with real notch and home-indicator
  insets, and therefore the only way to check `viewport-fit: cover` without an
  iPhone.

## 2026-08-23 — The linter had not run since TypeScript 7

Not "reported nothing" — `typescript-eslint` throws from its own module load,
before ESLint reads a file. Every rule in the config was dead: the Next rules,
react-hooks, jsx-a11y, import, all of it. `ci.yml` had this diagnosed and marked
non-gating, and its note was correct about every mechanism it listed. Confirmed
again here, including a scoped `pnpm` override and a root/workspace split, both
of which lose to the six packages pinning the same version. Patching the version
guard out reaches a crash inside `typescript-estree` reading a TS 7 API that
moved — the guard is load-bearing, not defensive.

What that note never asked is whether this project needs TS 7. It does not.
Nothing sets `experimental.useTypeScriptCli`, the tsconfig is plain ES2022, and
typecheck, tests and build are green on 5.9.3. The trade is compile speed —
TS 7's whole pitch — against a typecheck that takes about a second here, in
exchange for a linter that exists.

Turning it back on found **44 problems**. Nineteen were dead bindings, each
checked against where the thing actually lives rather than deleted on the
linter's word, because an unused import is equally the shape of a feature
somebody forgot to render. None were: `BlockButton` and `ReportControl` moved to
`post-row.tsx` where safety controls sit per post, and the room composer's
attachment went to `compose.tsx`.

Four were real defects, and none of them fail loudly:

- `photos-form` and `room-forms` kept a previous-value in `useRef` for React's
  adjust-state-on-prop-change pattern. A discarded render still mutates a ref,
  so the marker advances and the next render sees nothing to react to — an
  upload whose tiles do not move, a Reply press that does not fill the box.
- `switches.tsx` copied a prop into state through an effect, so a save that
  failed and rolled back showed the switch in the position it had just failed
  to reach.
- `post-row` declared `Counts` inside `PostRow`, making it a new component type
  every render — the whole control row, `LikeButton` included, remounting
  whenever anything in the post changed.

The remaining twenty-one are annotated rather than fixed. Most are
`react-hooks/purity` firing on `Date.now()` in Server Components: the rule
reasons about a client re-render and a Server Component renders once, per
request, on the server. The plugin has no notion of `"use client"` and the rule
takes no option for it.

Lint gates in CI again. Left advisory it would collect the next forty-four the
same way.

## 2026-08-22 — Everything that only goes wrong once it is installed

The manifest and the worker had been in for a while. What had never been checked
is what the app does on a phone that has actually added it, and the answer in
five places was "something worse than the browser tab".

iOS had no icon — `generate-icons.mjs` had been drawing `apple-touch-icon.png`
since the icons existed and nothing pointed at it, so iOS was putting a
screenshot of the sign-in page on the home screen. The bottom nav sat under the
home indicator, because `viewport-fit: cover` is the only thing that makes
`env(safe-area-inset-*)` report anything but nought. A rotated push subscription
died in silence, with the settings screen still saying "On for this device".
Launching from the icon opened a second window beside the first. And the app
icon carried no mark at all.

All fixed and **verified on a real iPad**: install, permission grant, and a real
push delivered through `web.push.apple.com`. The home-screen icon shows the mark
rather than a screenshot.

One finding worth recording because it looks like a bug and is not. On Android
the badge draws as **"1"**, and it stays at 1 however many arrive. Every call
here is `setAppBadge()` with no argument, and the type is `() => Promise<void>`,
so a number cannot be passed even by accident. A launcher badge on Android has
one shape and it is numeric, so a valueless flag comes out as the smallest
numeral there is. The distinction §8 cares about survives — a constant is not a
count, and "1" discloses exactly what a dot would. Kevin has asked to revisit
making it a real total; that is a §8 decision about what an app icon may say,
not a one-word change.

`pnpm push:test` also stopped asking for a `SUPABASE_DB_URL` nothing else needs.
It read `push_subscriptions` with its own SQL while `webPushNotifier` goes
through `push_devices_for`, so the tool meant to exercise delivery was a second
implementation of it and could have passed while the real path was broken.

## 2026-08-22 — 186 GB of dev server, and a machine that kept dying

Ubuntu had been crashing — eight boots in two days, several lasting minutes,
journals coming back "corrupted or uncleanly shut down" with no Linux OOM-killer
entries anywhere. Nothing in the log, because Linux never killed anything: the
host did.

The cause was in this repo. Next 16 moved `next dev` output out of `.next` and
into `.next/dev` and turns Turbopack's dev filesystem cache on by default
underneath it. `turbo.json` was written before that split — `.next/**` minus
`.next/cache/**` excluded the build-side cache and took everything else, which
now means 1.6 GB of dev-server scratch riding along in every cached build.
Decompressing the largest artifact settled it: 1.68 GB, of which 1.645 GB was
`apps/web/.next/dev`. The real output is 37 MB.

Turborepo does not prune a local cache. 1,595 entries had settled into **186 GB**,
and every crash lined up with an in-flight write of one — four boots ended with a
half-written `.tar.zst.tmp` stamped seconds after the last line in the journal.
A 6 GB VM compressing 1.6 GB with 28-thread zstd against a 13.7 GB host with
200 MB free is a spike Windows answers by taking the whole VM.

Excluding `.next/dev/**` puts an artifact at **7.4 MB**. A full build now peaks at
1,761 MB of 5,900 and finishes in under six seconds; the whole test suite peaks
at 2,145 MB.

`/mnt/c/Users/kband/.wslconfig` did not exist, so WSL took 28 processors and
could balloon to 7 GB. It now caps at 8 processors and 6 GB with
`autoMemoryReclaim`, which alone moved host free memory from 0.2 GB to 1.7 GB.
The disk image is still ~314 GB against 122 GB actually used — `fstrim` only
punched 3.7 GB of holes, which suggests WSL 2.3.26 is not honouring guest
discards. `wsl --update` and a re-run is the next thing to try; it is tidying
rather than a problem now.

## 2026-08-22 — Being spoken to

Kevin asked for a notification when somebody replies to a person's **comment**,
and when somebody is **tagged** in one. Those turned out to be the same missing
mechanism.

A room thread is two levels deep and no deeper — `enforce_flat_comments` refuses
a third. So answering a REPLY has nowhere to nest, and the product does what a
threaded conversation does once you stop drawing the indent: it puts the
person's name in the box, and the reply sits beside the others saying who it is
for.

That worked for reading and not at all for telling. The row nests under the
COMMENT, so `reply_received` went to whoever wrote the comment — and **the person
actually being answered, whose name the composer had just typed at the front of
the message, was the one participant nobody ever told.** Three people in a thread
and only two of them heard anything.

### The name became a tag

`@Cedar` is the same gesture the Reply button already made, with a mark on it
that can be found anywhere in a sentence rather than only at the front, and that
a member can type themselves. The messages already in the database open with a
bare name, so those still render as names — but only the tagged form is ever
notified, because a bare name cannot be told apart from a sentence that happens
to begin with a word.

**Resolving a name to a person happens behind a wall.** `room_messages.user_id`
is revoked from members, because an anonymous author must not be traceable. A
mention has to make exactly that hop, so it makes it inside a definer function
no member may execute, and the ids never travel back to anybody — they become
notifications for the people named and are then gone. A version of this a client
could reach would be a way to ask "is Cedar the same person as Willow", and that
question does not get an answer at any price.

The resolver also refuses the sender, anyone who has left the room, and both
directions of a block. An anonymous author matches their **alias and not their
display name**, so nobody can find an alias by tagging a person and watching.

### And a line that was wrong half the time

`reply_received` fires to the author of whatever was replied to — a post for a
comment, a comment for a reply — and said "replied to your post" either way.
Half of them sent somebody looking for a reply on something they had not
written. `my_notifications` now resolves the shape of the subject at read time,
so the line says "your comment" when it was one, and "you" when the row is gone
and it cannot tell.

Both link to the top of the thread, however deep the subject sits. A comment is
not a page — a thread rendered from a comment id has no root and draws nothing.

### Not done

Somebody both replied to and tagged in one message is told **once**: the reply
recipient is excluded from the mention recipients. And the author of a post is
NOT told when a reply lands on a comment underneath it — their thread already
carries a count, and a notification per descendant is the storm §3.3 exists to
keep out.

## 2026-08-22 — Notifications, and the half of §8 that had no trigger

Kevin asked for in-app notifications — the drop, connects, messages, likes,
replies, the chat and connect timers, premium reminders — all turnable off, and
all three of push, email and in-app.

**A notification here is an event and two references. It carries no text.**

That is the whole design. A stored sentence freezes the world as it was when it
was written: the name of somebody since blocked, the author of a post written
anonymously, a member since deleted. Storing the FACT and rendering it at read
time means the reader's own permissions decide what it says, every time they
look — `my_notifications()` resolves the actor through `visible_profiles` and the
destination through the member's own grants, so a name they may no longer see is
simply absent and a post since deleted is simply not a link.

It also keeps §8's guarantee intact. `buildPayload` is still the only way to make
a push or an email and it still refuses a condition word. In-app is behind the
login on a screen already showing names, so it can afford to say more — but it
says more by RENDERING more, not by storing more.

### What was actually missing

§8 named fifteen events. Six of them had a template, a channel plan and no code
anywhere that would ever send one. That was survivable while they were
unreachable strings in a config file. It stopped being survivable the moment each
became a labelled row on a settings screen, because **a control panel is a
promise about what the machine does**.

So every one of them now has a trigger, and a test asserts it:

| Event                        | Fires from                                        |
| ---------------------------- | ------------------------------------------------- |
| `connect_expiring`           | `connect-sweep` — warn, then sweep, in that order |
| `chat_closed`                | `fuse-sweep`, via `claim_chat_closed_notices()`   |
| `premium_expiring`           | new daily `premium-expiry` cron                   |
| `nearby_joins`               | new weekly `nearby-joins` cron                    |
| `verification_decided`       | the admin decision action                         |
| `referral_converted`         | `referral-rewards`, once per conversion           |
| `fuse_warning`, `drop_ready` | existing crons, now through the shared dispatcher |

`notifications-are-wired.test.ts` walks every source file, collects each event
name passed to `notify()`, and fails by name for any event that has a switch and
no sender. It is the loudest test in the file on purpose: this codebase keeps
producing the same failure — the quiz that could be skipped and never returned
to, `/admin` as a layout over nothing, `DROP.hourLocal` declared and never used,
`profiles.timezone` read in four places and written in none.

### Three decisions worth disagreeing with

**A connect warning goes only to the person who was asked.** Telling the sender
their connect is about to lapse is telling them the other person has not
answered — information about somebody else's behaviour that they can do nothing
with.

**A block is never announced.** `close_chats_on_block` ends the thread for both
people, and a notification there tells the blocked member something happened at
the exact moment the product's job is to make them disappear from each other
quietly. `claim_chat_closed_notices` excludes them, and excludes whoever did the
closing.

**`verification_decided` has no off switch.** A member waiting on a human to look
at their account has nothing to do but check, and a switch for it is a switch for
stranding yourself. `set_notification_mute` refuses it in the database, and the
settings screen says so rather than hiding the row.

### The switches store only OFF

A row in `notification_mutes` means "do not send me this, here". Absence means
the configured default. So a member who has never touched the screen has no rows
at all, and changing a default later reaches everybody who never expressed a
preference — which is what a default is for. Turning something back on DELETES
the row rather than writing a true.

Email is off by default everywhere except `premium_expiring`. §8 gives every
transactional email one subject with the content behind the login, so an email
adds a line in an inbox and nothing else — it is there for the member who wants
it, not as a default. `like_received` and `nearby_joins` are in-app only:
buzzing a phone for each is the engagement loop §3.3 bans.

### Where it lives

The bell sits beside the gear in the header rather than on the bottom bar. The
five items down there are places a member goes to DO the thing the app is for;
this is a record of what has already happened to them. The badge is a dot, not a
number — §8 keeps count granularity out of a notification, and the same argument
holds one layer in, because a header is visible over somebody's shoulder.

Opening the list is what marks it read, in an `after()` once the response has
gone — so the render the member is looking at still shows what was new, and the
bell is clear by the time they navigate. The layout's realtime watch is
INSERT-only for exactly this reason: a watch for everything would hear the page's
own bookkeeping and refresh the screen under the reader.

Settings gained a fourth tab. The device push switch moved there from General, so
that turning `message_received` on for push and finding nothing arrives — because
this browser was never subscribed — has its answer in view. The install card
stays in General: it is about the app shell rather than about notifications, and
the one fact it carried that the push control needs, that a lock screen shows the
web address either way, is in `pushPrivacyNote` too.

### Not done, and said out loud

`pnpm lint` cannot run in this environment at all — typescript-eslint refuses TS
7.0. That is pre-existing and unrelated to this work, but it means the lint gate
has not been passing for some time. `pnpm typecheck`, `pnpm test`, `pnpm build`,
`pnpm check:sql` and `pnpm check:db` all pass.

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

### THE NOTIFICATION ORIGIN — a decision only Kevin can make

Every web notification shows the site it came from. Android draws
`www.loveplusone.app` beside the title, installed or not, and the Notification
API has no property that suppresses it: a member must always be able to see
which site is notifying them, by design.

§8 exists because a lock-screen preview is visible to whoever is holding the
phone. It keeps a person, a subject and twelve condition words out of every
payload — and then the browser prints a domain that reads as a dating app,
under all of it, on a locked screen anybody can glance at.

Nothing in code fixes this. The three real options:

1. **Accept it.** The domain says "dating", not "diagnosis". A bystander learns
   less than they would from any of the apps beside it in the shade.
2. **A quieter domain.** The notification shows whatever the origin is. This is
   the only lever that keeps push and removes the tell, and it is a branding
   decision with a cost.
3. **Go native.** APNs and FCM notifications from a real app carry no origin at
   all — just the app's name and icon. This is the strongest argument yet for
   the native shell, and it is a stronger one than the iOS install requirement
   that prompted it.

Claude got this wrong first: the install copy claimed an installed app's
notifications carry no address. They do. Corrected 2026-08-21, and the copy now
says so plainly rather than promising something the platform will not do.

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

Also mine, added 2026-08-22 with the notification system — and this batch is
larger than a label pass, because **every sentence a notification says is in
it**:

- `NOTIFICATION_LINES` — the fifteen lines the in-app list renders, each in two
  forms depending on whether the reader may see a name.
- `NOTIFICATION_EVENT_LABELS` — the fifteen switch names on the settings screen.
- `NOTIFICATION_CHANNEL_LABELS` — "In app", "Push", "Email".
- Added 2026-08-22 with mentions: the `mention_received` line and its switch
  label "Someone tags you", and the reworded `reply_received` — which now says
  "your comment", "your post" or just "you" depending on what can be resolved.
- `notificationsHeading`, `notificationsEmpty`, `notificationsBellLabel`,
  `notificationsUnreadDivider`, `settingsNotifications`,
  `notificationSettingsHeading`, `notificationSettingsBody`,
  `notificationSettingsAlwaysOn`, `notificationSettingsPushOff`,
  `notificationSettingsSaveFailed`.

The **channel defaults** in `NOTIFICATION_DEFAULTS` are mine too, and they are a
product decision rather than copy: which of the fifteen buzz a phone by default,
which only appear in the list, and which send email. The events are Kevin's; the
channel each takes by default is not. Same for `NOTIFY_TIMING` — a day's notice
on a connect, three days on a lapsing subscription, a week's window on new
arrivals nearby.

### Held placeholders

Nothing below blocks Milestone 2 except where noted.
(The database password was supplied and the schema is applied — **rotate it**, it was
sent in chat. It is in no file in this repo; `pnpm check:db` reads `SUPABASE_DB_URL`
from the environment.)

| #   | Held                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Blocks        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1   | **Privacy contact address.** The policy commits to rights with response clocks and has no route for making a request. Domain secured 2026-08-17 as loveplusone.app; `privacy@loveplusone.app` is the intended alias. Note Resend only _sends_ — receiving needs mail hosting or a forwarding rule.                                                                                                                                                        | **launch**    |
| 2   | **Data export (§9.4).** Unbuilt, and second in the §10 cut order. The policy sentence is removed until it ships; a test keeps it out.                                                                                                                                                                                                                                                                                                                     | fast-follow   |
| 3   | **Five room display titles.** §5.2 locks the slugs, not the titles. Slug-derived placeholders sit in `20260813000800_seed.sql`, flagged inline. Still the only user-facing strings in the build not taken from the spec verbatim.                                                                                                                                                                                                                         | Milestone 5   |
| 4   | **Stripe keys** — secret, webhook secret, and the three price IDs.                                                                                                                                                                                                                                                                                                                                                                                        | Milestone 6   |
| 5   | **Resend API key.**                                                                                                                                                                                                                                                                                                                                                                                                                                       | Milestone 7   |
| 6   | **Liveness provider choice**, and its credential. Deferred 2026-08-14; running on `stub`. Recommendation is AWS Rekognition Face Liveness — see the spec correction above.                                                                                                                                                                                                                                                                                | before launch |
| 7   | **Decline cooldown length.** 30 days, and the number is Claude's guess, not Kevin's. Long enough to be a real answer, short enough not to be a permanent ban on someone who simply was not ready. `COOLDOWNS.declineDays` and `app_config` key `cooldowns.decline_days` — tunable from the config editor without a migration.                                                                                                                             | fast-follow   |
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
