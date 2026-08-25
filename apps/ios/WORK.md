# iOS / Capacitor — what is left

Everything the iOS shell still needs, so two sessions on two machines do not
start the same piece twice. Derived from the code on 2026-08-25, not from
memory — where an item says something is missing, it was checked.

## Who can take what

Most of this is **mac-only**, which is the best collision protection available:
it needs Xcode and Windows does not have it. The danger is the third column —
work the iOS shell needs that lives in `apps/web` and is editable from either
machine. Those are marked, and they are the ones worth claiming out loud.

| tag      | meaning                                                          |
| -------- | ---------------------------------------------------------------- |
| `mac`    | needs Xcode, the Simulator, or the native project. Mac session.  |
| `either` | lives in `apps/web` or `packages/`. **Claim before starting.**   |
| `Kevin`  | blocked on a decision, a credential, or an Apple account action. |

**To claim an `either` item:** put `[claimed: <machine> <date>]` on its line and
push that edit _before_ writing any code. There are no branches here, so a push
is the only signal the other session can see. If the push is rejected, pull —
somebody moved — and re-read the line before carrying on. Tick items off with
`~~strikethrough~~` and a commit sha; delete them once a release has shipped
past them.

---

## Blocks submission

- [ ] **Signing is unconfigured.** `CODE_SIGN_STYLE = Automatic` with **no
      `DEVELOPMENT_TEAM`** in `project.pbxproj`, so nothing can be built for a
      device or TestFlight — only the Simulator. Needs the Team ID from the
      Apple Developer account. `Kevin` → `mac`
- [ ] **No privacy manifest for the App target.** Capacitor ships
      `PrivacyInfo.xcprivacy` for its own frameworks; the app needs its own,
      declaring required-reason API use and what data it collects. Apple rejects
      at upload without it, and this app collects the categories they care most
      about. `mac`
- [ ] **Stripe cannot be the purchase path inside the shell.**
      `settings/premium/actions.ts` creates a Stripe Checkout session today.
      Offering that for a digital subscription inside an iOS app is guideline
      3.1.1 and a hard rejection — the 2026-08-24 decision already chose store
      billing at 15%. Two halves, and they are separable:
  - [ ] StoreKit products, purchase flow, receipt validation. `mac` + `Kevin`
        (products must exist in App Store Connect first)
  - [ ] Branch the premium screen so the Stripe path is not reachable when
        `inNativeShell()`. **`either` — claim it.**
- [ ] **App Store Connect listing.** Health-data privacy labels (the 2026-08-24
      entry argued this through), category, age rating, screenshots, and the
      seller name — `BRAND.legalName`, LuxWeb Studio LLC. `Kevin`
- [ ] **A released Xcode.** This machine has 27 beta 6, which is fine for the
      Simulator and not accepted for upload outside a transition window. `Kevin`
- [ ] **Decide whether a remote-URL shell is submittable at all** (guideline
      4.2, minimum functionality). Capacitor's own declarations call `server.url`
      "not intended for use in production". The mitigation is native capability,
      which is what the push and StoreKit items above would give it. `Kevin`
- [ ] **The icon and launch image are placeholder geometry** — Claude's, not a
      design. Replacing the SVG in `scripts/generate-icons.mjs` replaces every
      surface at once. `Kevin` → `mac`

## Blocks a shell anybody would want to use

- [ ] **The shell has no notifications at all.** Not degraded — none. Web push
      does not exist in a WKWebView, so the transport the web app uses is simply
      absent, and `push-toggle.tsx` correctly falls to `"unsupported"` and tells
      the member so. This is the largest functional gap between the shell and
      the installed web app, and it is also the strongest answer to the 4.2
      question above. Three pieces:
  - [ ] APNs key + capability, `@capacitor/push-notifications`, register the
        device token. `mac` + `Kevin` (the key comes from the developer account)
  - [ ] Store the token: `push_subscriptions.platform` already accepts `'ios'`
        and `nativePlatform()` already returns it — the token goes in
        `endpoint`. **`either` — claim it.**
  - [ ] An APNs provider beside the web one in `composeNotifiers()`. The seam
        exists precisely for this. **`either` — claim it.**
  - [ ] Then revisit `push-toggle.tsx`, which currently says "not available
        here" and would be lying. **`either`**
- [ ] **Universal links.** Without them a notification tap, or an emailed link,
      opens Safari instead of the app — and Safari has a different cookie jar,
      so it looks like being signed out. Needs
      `/.well-known/apple-app-site-association` on the domain (**`either`**) and
      the Associated Domains entitlement (`mac`).
- [ ] **Keyboard behaviour is unverified.** The composer is
      `fixed bottom-[var(--nav-h)]` and `--nav-h` now includes the home-indicator
      inset. The classic WKWebView failure is that the inset stays applied when
      the keyboard is up, leaving a gap above it. May need
      `@capacitor/keyboard`. `mac`

## Verification debt — all `mac`

Everything here is written correctly as far as reading it goes. That is not the
same claim as having looked.

- [ ] **The two bottom sheets**, `modal.tsx` and `route-modal.tsx`. Both carry
      `env(safe-area-inset-bottom)`; both need a tap to open and `simctl` cannot
      inject one. The outstanding half of the safe-area check.
- [ ] **The chat screen** — composer, voice recorder, and the keyboard together.
- [ ] **Dusk.** Every shell screenshot so far is Linen. A dark ground needs light
      status-bar text, and `UIViewControllerBasedStatusBarAppearance` is `true`
      with nothing setting the style.
- [ ] **The offline page.** `server.errorPath` points at `public/index.html` and
      it has never been made to render.
- [ ] **The camera**, which is the liveness check and therefore the gate on
      joining. The purpose strings are in place and Capacitor implements the
      media-capture delegate, but no Simulator has a camera — this one needs a
      device, so it waits on signing.

## Carried from elsewhere, because iOS makes them matter more

- [ ] **`NEXT_PUBLIC_APP_URL` points at `app.loveplusone.app`, which 404s.** It
      is Stripe's return URL, the add-an-address email target, and what room
      share links are built from. Also decide whether the apex or `www` is
      canonical — `NEXT_PUBLIC_SITE_URL` is the apex, which 308s, and the shell
      loads `www` because of it. `Kevin` → **`either`**

## Deliberately not doing

- **Android.** A TWA is real Chrome and shares nothing with this directory. A
  change to `apps/web` reaches both; nothing in `apps/ios` does. See `AGENTS.md`.
- **Migrating Android to Capacitor.** Settled on 2026-08-24 and the reasoning is
  in that entry.
