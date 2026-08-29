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
- **Migrations are applied BY HAND, and `supabase db push` still must not be
  used.** Use `node scripts/apply-migrations.mjs [--dry-run] <file>...` — named
  files rather than a range, one transaction each, rolled back unless every
  object the file declares resolves afterwards.

  The ledger was backfilled on 2026-08-26 and now holds 75 of 90 rather than 28,
  every one of them checked against the live schema by
  `scripts/backfill-migration-ledger.mjs`. That does NOT make push safe. Fourteen
  files leave no trace a schema can be asked — grants, revokes, data — so they
  were deliberately left out, and push would replay them. Two of those are not
  replay-safe: `20260815000900_slugs_are_urls` would re-add a constraint that
  `slugs_are_not_urls` deliberately dropped, and
  `20260817000600_a_voice_note_in_one_write` creates a policy without dropping it
  first. `--include-unverifiable` will record them and is Kevin's call, not a
  session's: recording a migration that never ran means push skips it forever.

  **Re-run `backfill-migration-ledger.mjs` after applying anything.** Applying by
  hand does not record it, so the ledger drifts the OTHER way from the failure
  above — applied but unrecorded — and the symptom is somebody being told to
  apply what is already there. That happened on 2026-08-26: 000300 and 000400
  were applied, the ledger did not know, and a runbook nearly sent Kevin to
  re-run an `alter table ... add column`. The dry run is read-only and settles it
  in one command.

- **A NEW table arrives with `anon` and `authenticated` holding everything.**
  Supabase's default privileges grant all on new tables in `public`, and
  20260813000700's opening `revoke all ... from anon, authenticated` only
  covered what existed in August. Every migration that creates a table must
  revoke for itself and then grant back what it means to expose. Two had missed
  it; `check:db` now catches both roles.
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
- **This repo is inside iCloud Drive, and iCloud duplicates files in it.**
  `~/Documents` is synced, and iCloud resolves a conflict by dropping a
  byte-identical copy named `thing 2.ext` beside the original. They appear with
  no warning and `git add -A` commits them — which is exactly how
  `config 2.xml` sat in the tree for two days. `.gitignore` now carries
  `* [2-9].*` so it cannot happen again, but the duplicates still appear on
  disk, and a build that reads a whole directory will see them. **Worth asking
  Kevin whether the project should move out of `~/Documents` altogether**; a
  repo with a `node_modules` in it is not something iCloud should be syncing.
- **`next dev` can fail with "Failed to open database / Loading persistence
  directory failed".** Turbopack's persistent cache, corrupt. `rm -rf
apps/web/.next` and start again. It is not a code error and the message does
  not say which database it means.
- **git pushes through `gh`, not the keychain.** Upgrading git broke the
  osxkeychain entry's trust and a push hung on an invisible GUI dialog.
  `gh auth setup-git` is configured; if a push ever hangs with no output, look
  for a `SecurityAgent` process before assuming the network.

### iOS shell (macOS only)

- **Xcode is `/Applications/Xcode-beta.app` (27 beta 6).** `xcode-select` still
  points at CommandLineTools and changing it needs sudo, so everything is driven
  with `DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer` instead.
  It is a beta: fine for the Simulator, **not** for a submission build.
- **TWO Xcodes, and the release one is the submission toolchain.**
  `/Applications/Xcode.app` is 26.6 (release) and **cannot launch** — macOS 27.0
  beta refuses it. Irrelevant: its `xcodebuild` works and every command here is
  `xcodebuild`, so point `DEVELOPER_DIR` at it for anything going to review, and
  at `Xcode-beta.app` (27.0) only for Simulator work. Verified 2026-08-29 with a
  Release build against `iPhoneOS26.5.sdk`, which is the public SDK submissions
  require.

  Getting there needed two things the errors do not name. **The licence** —
  `sudo env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild
-license accept` — because until it is accepted EVERY command, `-showsdks`
  included, answers with the licence text and reads like a broken install. And
  **the platform**: `xcodebuild -downloadPlatform iOS`, 8.5 GB, during which
  `-showsdks` happily lists iOS 26.5 while builds fail saying it is not
  installed. Listed and installed are different things, and that is two hours if
  you believe the first one.

- **A modern Xcode ships with no simulator to run.** `xcodebuild -downloadPlatform iOS`
  is a second, much larger download, and nothing warns you — `simctl list
runtimes` just comes back empty.
- **The WebView is not inspectable unless you build with `CAPACITOR_DEBUG=true`.**
  Capacitor arrives as a prebuilt SPM xcframework, so its own `#if DEBUG` is
  false however you build the app; it falls back to a `CAPACITOR_DEBUG` key in
  Info.plist, which is `$(CAPACITOR_DEBUG)` and empty unless passed. Without it
  `ios_webkit_debug_proxy` lists no pages at all on every socket, which reads as
  the proxy being broken.
- **…and even with it, the proxy does not work on this runtime.** Version 1.9.2
  lists an empty page array on every socket against the Xcode 27 beta simulator,
  with the app running and `isInspectable` genuinely set. It worked on the 25th
  on an older runtime. Treat driving the shell over WebKit's remote protocol as
  unavailable until that is sorted — the screenshot technique below is what
  works today, and it is why the premium screen could not be driven to a
  signed-in state on 2026-08-26.
- **There is a simpler way to script the shell than the proxy.** Point
  `server.url` in `ios/App/App/capacitor.config.json` at a local page that runs
  the checks and renders the answers, then `simctl io screenshot`. No inspector,
  no Target-domain wrapping, and the result is a picture you can put in a commit.
  Restore the config and reinstall afterwards. The proxy is still the only way
  to drive a page you did not write.
- **An unanswered system permission alert survives uninstall.** It is presented
  by SpringBoard, so reinstalling the app re-presents it over whatever runs next
  — including a bare page with no push code, which is exactly how it reads as a
  regression that does not exist. `simctl shutdown` then `boot` clears it.

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
- **`adb` reaches an Android phone from WSL over the LAN, no cable.** Android's
  wireless debugging is enough; WSL's NAT routes outbound to the LAN fine, and
  nothing is needed on the Windows side. Two traps, both costing a round trip:
  the **pairing port is not the connect port** and both change every time the
  dialog is opened, and the pairing dialog **expires in under a minute** — so
  the code has to be sent and used immediately. `adb pair <ip>:<pairport>
<code>` then `adb connect <ip>:<connectport>`.

  What it buys, beyond logs: launch any page straight into the TWA with
  `adb shell am start -a android.intent.action.VIEW -d <url>` (assetlinks is
  verified, so it opens in the app, not a browser), and read the screen with
  `adb exec-out screencap -p`. That is the Android equivalent of the
  `simctl io screenshot` technique the iOS lane uses.

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

### 2026-08-27 · WSL · the Android buy button, and what logcat settled

**Not fixed, and the reason is worth the length.** Play returns an empty
catalogue to the TWA, so there is no buy button on Android. Everything under our
control is now verified correct and it still returns 0. Full detail is backlog
server 13; what belongs here is the shape of the day.

**`clientAppUnavailable` is TRANSIENT.** It flipped three times in an hour on
one device, with nothing changing between readings. Two consequences: the
upstream issues that call it a permanent property of a device are describing
something else, and **no single reading of this is its state** — I told Kevin
the blocker was fixed on one reading and it came back twenty minutes later.

**Clearing the Play Store cache reproduces it on demand.** That is a
reproduction none of the three upstream issues has, and it is worth reporting.
It is also how I broke a working state: "clear Play Store cache" appears in
those threads as a remedy people tried, and on this evidence it may be how some
of them acquired the problem. It has not refilled since.

**Ask both `getDetails` AND `listPurchases`.** They cross the same bridge, so
one answering while the other throws separates a broken CONNECTION from a broken
LOOKUP. Three days of readings looked identical until the diagnostic asked both.

**Finsky's obfuscated account id is `base64url(sha256(email))`**, padding
stripped. Play logs which account it bills an app against and prints only that
hash; computing it against the tester address settled in one command what would
otherwise have meant reading somebody's list of seventeen Google accounts.

**Read the artifact, not the config.** `DelegationService`'s `android:enabled`
is a resource REFERENCE in the generated manifest, and the value that matters is
in the packaged resource table — `aapt2 dump resources` on the signed APK. A
false one there is the most-cited cause of this error; ours is true.

**Left off clean.** typecheck, lint and format green; the play, shell and
subscription suites pass. Nothing claimed. `adb` is paired to Kevin's phone and
can be reconnected with `adb connect 192.168.50.94:44687` while wireless
debugging stays on. The on-page diagnostic panel is deployed and **must come out
once Android has been bought from once** — it renders only on the failure path
and shows no purchase, but it is not something a member should ever meet.

### 2026-08-27 · macOS · the renewal landed; the lane is empty but not finished

**Apple's payment path is closed.** The renewal notification arrived and applied
— `DID_RENEW`, 200, row moved a day forward. What made it conclusive is worth
carrying: the ROW MOVING IS NOT PROOF the webhook did it, because
`NativeIapRecovery` writes the same row from StoreKit's update stream when the
app is open. Two recovery paths is good for a member and bad for a diagnosis.
The Vercel log line is the only thing that separates them.

**One thing I got wrong and corrected**: I marked the badge done without
recording that it has never been seen on a device. Chat is not a record. It is
in BACKLOG item 12 now with the other three.

**FOUR iOS THINGS ARE UNSEEN AND ONE BUILD CLOSES THEM.** Build 1.0 (4) on
Kevin's iPad was archived at 12:56 on the 26th, before the badge, `PlusOneShell`
and `@capacitor/keyboard` existed — verified against the archive's binary, not
assumed. So the badge count, the status-bar band, the keyboard inset and the
camera are all waiting on one TestFlight upload. **Anything Kevin reports about
the keyboard or the status bar on that build is describing superseded code**,
which is the trap worth knowing before somebody debugs it.

I have not made that build: an upload is Kevin's to authorise and he has not
been asked yet.

**Left off clean.** Five gates green on `bfc5062` plus my own, tree clean,
nothing claimed, simulator on the shipped config.

### 2026-08-26 · macOS · StoreKit, links, keyboard, the band — through `221daa3`

**Done and pushed.** The iOS shell has a StoreKit 2 plugin and the page has a
wrapper for it (`native-iap.ts`). Reasoning is in the commit body and in
`PROJECT_UPDATES.md`; what is worth carrying here is that all three things that
went wrong were silent, and one of them is a Capacitor trap anybody adding a
local plugin will hit:

- **`registerPluginType` starts `if autoRegisterPlugins { return }`.** It is the
  call every guide shows and auto-registration is the default, so it does
  nothing, logs nothing, and returns. Use `registerPluginInstance`.
- **`SceneDelegate` builds the root view controller directly**, and the template
  also ships a `Main.storyboard` naming one. The line wins; the storyboard is
  never read. An edit there looks correct and changes nothing.
- **A call to an unregistered plugin never settles.** No rejection, no error —
  the page just waits, which sends you looking at your own promise code.

**Deliberately unwired.** No screen calls any of it. Nothing yet verifies a
transaction or writes `iap_entitlements`, so a buy button today would take money
and grant nothing. The seam is written up as **server lane 13** with the exact
payload — it is a small piece and it is in your lane, and the moment it exists
the UI half is quick.

**Not verified, and cannot be from here:** an actual purchase. That needs a
Sandbox tester on the iPad, which is a Kevin item now on his lane.

**Universal links, both halves now done.** Your association file was already
serving; the entitlement and a handler for it are in. Two things worth carrying:

- **Capacitor posts a notification for a tapped link that nothing in core
  listens to.** `@capacitor/app` is what normally does. Without a listener the
  app opens on whatever page it last had and the link is lost — worse than the
  Safari behaviour, because there is nothing to say a link was involved.
- **Simulator builds are stripped of entitlements** — the `.xcent` is an empty
  dict — so a domain can never be claimed there and a tap cannot be tested. Same
  shape as push. It needs TestFlight, and iOS fetches the association file at
  INSTALL, so a build already on the iPad needs reinstalling rather than
  relaunching.

**Universal links work on the iPad** — Kevin confirmed a link from Notes opens
the app. It needed **build 1.0 (4)**, uploaded from here. The trap: an
entitlement is read out of the app, so the build already on a device can never
claim a domain however often it is reinstalled. It needs replacing, not
reinstalling, and the first note written about this got that wrong.

**`ExportOptions.plist` is in the repo now.** `apps/ios/README.md` has described
it since the first TestFlight build and it only ever existed in someone's
`/tmp`, so the documented archive command has been failing for anybody following
it. `destination: upload` sends the build straight up on the Xcode Apple ID —
no API key, no Transporter.

**The keyboard is measured, and it is not what the list said.** The composer
does NOT vanish behind the keyboard — iOS resizes the web view even with no
plugin. The predicted bug is real though: the safe-area inset stays applied with
the keyboard up, so the nav reserves 34px for a home indicator that is behind
the keyboard. `@capacitor/keyboard` at `resize: native` fixes it.

**One thing found and deliberately not fixed** — backlog shells 13. The web view
never returns to full height after the keyboard closes (874 -> 765, and it stays
765), which puts the nav off the bottom of the screen. It happens with and
without the plugin. **Please do not build a workaround for it from the numbers
alone**: this runtime is Xcode 27 beta 6 and the keyboard was dismissed
programmatically. It wants a person and an iPad first.

**The grey band is gone**, and the seam that did it is worth knowing about.
`overrideUserInterfaceStyle` is what draws it and no Capacitor API exposes it,
so there is now a second local plugin — `PlusOneShell` — beside the StoreKit
one. **`ShellPlugins.swift` is where anything native gets registered** — one
line per plugin, and `MainViewController` was split down to a table of contents
in `39db9a8`. That is the whole cost of reaching UIKit from the page now, for
the badge or anything else.

**Sampling pixels out of a screenshot, since there is no PIL on this machine:**
`sips -s format bmp` and read the rows. `scratchpad/sample.py` does it and took
five minutes to write; it turned "the band looks gone" into a drift of 100 to 1.

**How to script the shell, worth reusing.** Point `server.url` at a local page
that measures what you want and renders it, then `simctl io screenshot`. Two
things that cost time: measure **after layout settles**, because a reading
during first paint reports a safe-area inset of nought; and pin the readout
somewhere that stays visible — a panel at `top: 0` scrolls off the moment the
keyboard opens, which is itself the thing under test.

**Left off clean.** Gates all five green, shell config restored to
`https://www.loveplusone.app` and reinstalled on the simulator, probe server and
proxy stopped.
