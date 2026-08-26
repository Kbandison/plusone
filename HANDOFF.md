# Handoff

Two Claude sessions work on this repo — one on Kevin's MacBook, one on Windows
under WSL — and they push to the same `main` without seeing each other's
machines. This file is for the half of the state that a push cannot carry.

## What belongs here, and what does not

`git log` and `PROJECT_UPDATES.md` already say what changed and why, and they
work: read them first. **Do not restate them here.** Duplicating a changelog is
how two records start disagreeing, and `PROJECT_UPDATES.md` is a dated log that
must never be rewritten backwards — which makes it the wrong shape for "where I
am standing right now".

So this file holds only what the other session cannot get from the repository:

- **Machine notes** — what is installed, what is broken, what has to be worked
  around on one machine and not the other. Durable; edit in place when it stops
  being true.
- **Where the last session stopped** — in-flight work, and anything half-done
  that a clean checkout would hide.
- **Traps** — the hour-long dead ends, written down once so the other session
  does not pay for them again. Both machines lost an afternoon to the same
  database hostname on 2026-08-25. That is what this file exists to stop.

**Outstanding work is not here — it is `BACKLOG.md`**, which is a durable list
rather than a whiteboard. Both files are imported by `AGENTS.md`, so neither
depends on being remembered.

Keep it short. If a section has been true and unread for a month, delete it.

## How to use it

- **Read it at the start of a session**, before touching anything.
- **Rewrite your own block at the end of one.** Newest first, keep the last
  three; delete below that. This is a whiteboard, not an archive.
- **Correct the other session's block if it is wrong.** Nothing here is a dated
  record, so there is no history to preserve — a stale machine note is worse
  than no machine note, because it will be believed.
- Anything that turns out to be a product decision belongs in
  `PROJECT_UPDATES.md` instead, and anything Kevin has to decide belongs in that
  entry's **Held for Kevin**.

---

## Machine notes

### Shared

- **`SUPABASE_DB_URL` must be the session pooler**, on both machines. The direct
  host `db.<ref>.supabase.co` publishes an AAAA record and no A record, and
  neither machine has an IPv6 route — ENETUNREACH on WSL, ENOTFOUND on macOS.
  The full note, including the username change that goes with it, is in
  `.env.example`. Nothing in `apps/web` reads this key; it is scripts only.
- **The scripts do not load `.env.local`.** They read `process.env`, so a
  `check:*` or `seed` run needs the value exported into the shell first.

### macOS (Kevin's MacBook)

- **Node is `node@22`, linked over Homebrew's `node`.** `mongosh` depends on the
  `node` formula, so **any `brew upgrade` touching it relinks a newer Node over
  22** — that happened on 2026-08-25 and also took `pnpm` out with it, because
  corepack's shim lives in the linked Node's bin. CI pins 22, so a machine
  drifting off it produces a green local run and a red CI one. **Check `node -v`
  after any `brew upgrade`**; the repair is `brew unlink node && brew link
--overwrite node@22`, then `corepack enable --install-directory /opt/homebrew/bin`.
- **`.env.local` lives at the repo root and is symlinked into `apps/web/`.**
  Next reads env from the app directory, not the workspace root, so without the
  symlink `pnpm dev` starts with no environment and every page throws. The
  README's quickstart still says to put it at the root — unresolved, and Kevin's
  call which location is canonical.
- **git pushes through `gh`, not the keychain.** Upgrading git broke the
  osxkeychain entry's trust and a push hung on an invisible GUI dialog.
  `gh auth setup-git` is configured; if a push ever hangs with no output, look
  for a `SecurityAgent` process before assuming the network.

### iOS shell (macOS only)

- **Xcode is `/Applications/Xcode-beta.app` (27 beta 6).** `xcode-select` still
  points at CommandLineTools and changing it needs sudo, so everything is driven
  with `DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer` instead.
  It is a beta: fine for the Simulator, **not** for a submission build.
- **A modern Xcode ships with no simulator to run.** `xcodebuild -downloadPlatform iOS`
  is a second, much larger download, and nothing warns you — `simctl list
runtimes` just comes back empty.
- **`CAP_SERVER_URL` takes a path, not just an origin**, and `http://localhost`
  works (ATS exempts loopback). The reason the path matters is in the
  `allowNavigation` comment in `apps/ios/capacitor.config.ts`.
- Nothing in `apps/ios/` affects the Android TWA. A change to `apps/web` reaches
  both — see `AGENTS.md`.

### WSL / Windows

- No IPv6 by default, hence the pooler note above.
- **`pnpm push:test` reaches no iPhone from here without setup**, and says so
  quietly. It needs the four `APNS_` values in `.env.local`; `vercel env pull`
  brings three and refuses `APNS_PRIVATE_KEY`, which is Sensitive on purpose and
  therefore write-only — that one comes off the `.p8` by hand, newlines escaped
  as `\n`.

  The tell that a checkout predates 2026-08-26 is the output itself: the old
  script prints `sending to 2 device(s)…` and skips every `ios` row in silence.
  The current one prints `sending to N web and M iOS device(s)…` and names APNs
  explicitly when it is unconfigured. Kevin lost a round trip to exactly this —
  the send looked successful and the phone stayed quiet.

- **Node is 24.3.0 and CI pins 22.** `engines` only says `>=20.9.0`, so nothing
  catches the drift — same failure the macOS note describes, from the other
  direction. Nothing shipped so far depends on 24, but a green run here is not
  evidence about CI.
- **6 GB and 8 CPUs, by `/mnt/c/Users/kband/.wslconfig`, against a 13.7 GB
  host.** Left at WSL's defaults it takes 28 processors and may balloon to 7 GB,
  and Windows answers that by killing the VM outright — eight boots in two days
  on 2026-08-22, with corrupted journals and no Linux OOM entries, because the
  kill came from outside Linux. Do not raise those numbers casually, and prefer
  a targeted `vitest` run to `pnpm test` when only one file is in question.
- **Bubblewrap needs the LEGACY Android SDK layout, and lies about why.** Its
  error says the SDK path should "contain the folder `build`". It does not check
  for that. `AndroidSdkTools.validatePath` checks for `<sdk>/tools` or
  `<sdk>/bin`, and a modern SDK has `cmdline-tools/latest/bin` and neither — so
  a complete, working install fails with a message pointing somewhere else
  entirely. Fixed here with `ln -s cmdline-tools/latest ~/Android/Sdk/tools`.
  It also pins **build-tools 36.1.0** specifically, not "any 36".
- **The disk image does not shrink.** `ext4.vhdx` is ~314 GB against 122 GB
  actually used. `fstrim` reclaimed 3.7 GB of that — WSL 2.3.26 does not honour
  guest discards properly. `wsl --update`, then re-run `--set-sparse true` and
  `fstrim`, is the untried next step. Not urgent; C: has room.

---

## Touching

Claim before you start, not after — `BACKLOG.md` and `AGENTS.md` both send you
here, and a claim written afterwards is a description rather than a claim. One
line per session; clear it when you finish or abandon the item.

| session | item | since |
| ------- | ---- | ----- |
| _macOS_ | —    | —     |
| _WSL_   | —    | —     |

## Sessions

### 2026-08-25 (later still) · macOS · status bar

**Done.** The status bar text now follows the page theme rather than the system
appearance — `status-bar-style.tsx`, mounted at the root layout. Verified across
all four combinations in the Simulator.

**Two things worth carrying:**

- `SystemBars` is built into `@capacitor/ios`. `@capacitor/status-bar` drives
  the identical `bridge.statusBarStyle`; it was added, found redundant and
  removed. Check core before adding a Capacitor plugin.
- **The bridge exposes `Capacitor.nativePromise(plugin, method, options)` to a
  remote page.** Nothing needs bundling into `apps/web` to call native. That is
  the seam for every remaining plugin item — badge, push, whatever else.

**Left off clean.** Dev server stopped, proxy stopped, shell config restored and
reinstalled on both simulators, simulator appearance back to light.

### 2026-08-25 (later) · macOS · the safe-area check closed out

**Done.** Both bottom sheets measured open in the shell, plus Dusk and the
offline page. The tool that unstuck it is worth knowing about: `simctl` cannot
inject a tap, but Capacitor sets `isInspectable` on DEBUG builds, so
`ios-webkit-debug-proxy` can drive the WKWebView over WebKit's remote protocol
and evaluate JavaScript in it. That is how anything in this shell gets scripted.

Two things about it that cost time:

- The simulator's inspector socket is under **`/private/var/tmp/com.apple.launchd.*/`**,
  not `/private/tmp`, and there is one per runtime — most of them answer with an
  empty page list. Find the live one by trying each.
- WebKit does **not** accept bare `Runtime.evaluate`. Everything is wrapped in
  the `Target` domain: `Target.setPauseOnStart`, wait for `Target.targetCreated`
  to learn the id, then `Target.sendMessageToTarget`, and replies come back
  inside `Target.dispatchMessageFromTarget`.
- **Measure sheets after the animation settles.** A reading taken straight after
  `showModal()` had the sheet 24px below the viewport and reported a false
  failure; three seconds later it was flush and correct.

**Left off clean.** Seeds removed, `check:seed` green, shell config restored to
`https://www.loveplusone.app` and reinstalled on both simulators, proxy stopped,
simulator appearance back to light.

### 2026-08-25 (later) · WSL · pushed through `e8eee7d`

**Done and pushed.** The privacy-policy audit (five claims corrected, three
guards, all pinned by tests) and every mechanical launch gate green against the
live database — `pnpm check:launch` in full. Then two backlog items:

- **`registerPushDevice` takes a native token** (`e4ebe23`). It hard-coded
  `p_platform: "web"` and demanded both web keys, so an APNs or FCM token could
  not be stored at all. The RPC and the table always allowed it. Verified in a
  rolled-back transaction: an `'ios'` row with null keys is accepted, a `'web'`
  row without them is still refused. **This is the seam under shells item 2** —
  your client can call `registerPushDevice({ platform: "ios", token })` now.
- **The shell no longer offers a Stripe checkout** (`e8eee7d`). Guideline 3.1.1,
  a rejection rather than a warning. Prices hidden with the button, and
  `ManageBilling` too, since changing a plan is a purchase.

**Please verify when you next have a Simulator up:** the premium screen should
show subscription status and **no** buy button, no prices, and no Manage
billing. I cannot check it — `inNativeShell()` is false everywhere I can reach,
so that guard is proven by unit test and reasoning, not by watching it hide. If
anything renders, say so here and I will take it back.

**Left off clean.** Nothing half-finished, gates green, `check:launch` green.

**Not done, and not claimed:** the three §8 and store decisions that are Kevin's
(email defaults, badge counting, `RESEND_FROM`), and server items 2–4, which
genuinely wait on App Store Connect having products — building the entitlement
columns before then is guessing at a schema.

### 2026-08-25 · macOS · pushed through `d4f2a52`

**Done and pushed.** The Capacitor iOS target exists and runs
(`33e7888`), and the iPhone safe-area check that had been top of Held for Kevin
since the 24th is finished (`d4f2a52`). Details in `PROJECT_UPDATES.md`; the
short version is that the bottom edge was correct and measured on two devices,
and the top edge was not — `/app`'s header was drawing the wordmark underneath
the status bar clock in the shell, and only in the shell.

**Left off clean.** No half-finished edits, no local commits, gates green,
`check:seed` green. The simulators hold a build of the shipped config.

**Not done, and not claimed:**

- **The two bottom sheets** (`modal.tsx`, `route-modal.tsx`) were never
  exercised. Both need a tap to open and `simctl` cannot inject one. If you find
  a way to drive Simulator UI, that is the outstanding half of the safe-area
  check.
- **Android / TWA is unverified** for the header change in `d4f2a52`. It is
  web-side, so it reaches the TWA. It should be inert there — Chrome in a TWA
  reports a top inset of nought — but nobody has looked.

**Traps paid for, so you do not have to:**

- `auth.admin.listUsers()` failing with "Database error finding user" was
  **never** a Supabase outage. `seed-test-members.mjs` was writing NULLs into
  GoTrue's token columns and one such row breaks the call for every caller.
  Fixed at the source in `d4f2a52`, and pinned by `seed-safety.test.ts`.
- A seeded member could not sign in even with a complete profile: the onboarding
  resolver reads `phone_confirmed_at` off `auth.users`, which the seeder never
  set. Also fixed.
- `check:seed` had been red with 24 members in production and nobody noticed,
  because it is not one of the five CI gates and needs a credential CI does not
  have. Worth running by hand now and then.

**Three `@dev.invalid` members from `/dev/sign-in` are still in the database.**
No gate covers them and they are harmless, but they are there.
