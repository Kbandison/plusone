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

_Owned by that session — fill in and correct as needed._

- No IPv6 by default, hence the pooler note above.

---

## Sessions

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
