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

  **An APPLIED migration is never edited, including its comments. Kevin's call
  2026-08-29**, after the two sessions had quietly diverged on it for an
  evening. Supersede it with a new file, the way 20260826000200 fixed
  20260826000100 rather than rewriting it. An applied migration is a record of
  what ran, and a record you may edit is not one.

  This is a stricter rule than the mechanics require and that is deliberate: a
  comment-only edit causes no drift, `check:sql` passes either way, and the
  ledger's `statements` column is NULL so nothing compares the text. All true,
  and none of it is the point — the value is that the file still says what was
  applied. Explanatory prose goes where the code is read instead.

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

- **CODE REACHES PRODUCTION BEFORE THE SCHEMA DOES, as a matter of course, and
  PostgREST does not fail narrowly on an unknown column — it fails the WHOLE
  request.** Migrations here are applied by hand and are Kevin's call, so a push
  deploys against whatever schema is live, which for a migration written the
  same day is the old one.

  `data: null`, so a page selecting one column that does not exist yet renders
  with NOTHING. One unshipped column blanked the entire profile — no name, no
  bio, no prompts, no intention — for every member, on 2026-08-29. The write is
  the mirror: an update naming a missing column fails entirely, so "that did not
  save" was true of every other field on the form too.

  Nothing in the build can catch it. `check:sql` validates the migration,
  typecheck validates the TypeScript, and the gap between them is where this
  lives. The shape of the fix is in `c96122a`: read the new columns in a
  SEPARATE request that is allowed to fail, and retry the write without them on
  PGRST204 or 42703 — narrow, because a catch-all swallows a real write error
  and tells the member it saved.

- **`--dry-run` catches what `check:sql` structurally cannot.** `check:sql`
  parses against the real PostgreSQL grammar, so it passes anything
  syntactically legal — including a CHECK constraint containing a subquery,
  which Postgres rejects outright at execution. That exact thing was written on
  2026-08-29 and only the dry run found it. Run it before trusting a green
  `check:sql` on anything new.

- **A NEW table arrives with `anon` and `authenticated` holding everything.**
  Supabase's default privileges grant all on new tables in `public`, and
  20260813000700's opening `revoke all ... from anon, authenticated` only
  covered what existed in August. Every migration that creates a table must
  revoke for itself and then grant back what it means to expose. Two had missed
  it; `check:db` now catches both roles.
- **Read the ARTIFACT, not the claim about it.** Every finding on 2026-08-29,
  in both lanes, came from this and nothing else: the packaged resource table
  rather than the generated manifest, `information_schema` rather than the
  migration that created the table, the tree rather than the backlog entry, the
  rendered control rather than the source scan, the live schema rather than
  another session's account of it. It reads as a list of lessons and it is one
  technique applied to ten artifacts.

  The corollary is why it needs saying: a claim goes stale silently, in
  whichever direction costs least to believe, and **prose has no gate at all**.
  The prose cases that day had each survived several sessions; the test-shaped
  ones fell the moment somebody widened a regex. A guard helps only where you
  can say what it does NOT cover.

- **`git checkout <file>` to undo a sabotage run eats the unstaged work with
  it.** Breaking a guard on purpose to watch it fail is worth doing, and the
  obvious undo is the destructive one — `git checkout` restores from the index,
  so an edit that was never staged is simply gone. Cost me a comment block on
  2026-08-29. Hold the original in the script that does the sabotage and write
  it back, or `git stash` around the run.

  **And a sabotage that PASSES proves nothing.** macOS's version reported FAILS
  on every row, which is self-verifying: the test can only fail if the edit
  landed. Mine reported silence, and silence reads identically for "the guard is
  vacuous" and "the edit never happened" — the shell had mangled a multi-space
  string, nothing was replaced, and I was one step from rewriting a guard that
  was fine. So: a failing sabotage proves itself; a passing one is not evidence
  until you have separately confirmed the file changed.

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
- **THE XCODE CLOUD BUILD NUMBER IS NOT AUTOMATIC. Bump it before every
  archive, or the build fails at the end.**

  `CURRENT_PROJECT_VERSION` is committed as a UTC minute stamp
  (`202608292012`). That number is a FLOOR, not a mechanism: the next Xcode
  Cloud archive reuses it and dies at "Prepare Build for App Store Connect"
  with "The bundle version must be higher than the previously uploaded
  version", after a full three-minute build.

  Three attempts to set it from a script all failed, and what is known is worth
  more than the theories were:

  - `ci_scripts/` at `apps/ios/ios/App/` IS the right place. The log shows
    `Run ci_post_clone.sh script`, and names
    `/Volumes/workspace/repository/apps/ios/ios/App` when looking for the
    others.
  - `ci_post_clone.sh` DOES run. The project cannot compile without the files
    `cap sync` writes, and it compiles.
  - `Info.plist` reads `$(CURRENT_PROJECT_VERSION)`, so the pbxproj is the
    correct file to edit, and editing it by COMMIT works.
  - Editing that same file from inside `ci_post_clone.sh` does not reach the
    archive. Why is unknown. `ci_pre_xcodebuild.sh` did not work either.

  **The next person should read the expanded `Run ci_post_clone.sh script` log
  before touching this**, which is the one thing nobody has done — three fixes
  were reasoned out and all three were wrong.

- **Xcode Cloud is set up, and the first build is a CONTROLLED EXPERIMENT.**
  Created 2026-08-29 from Xcode-beta, because App Store Connect will not create
  a first workflow in the browser and the release Xcode cannot launch here. The
  workflow only configures; builds run on Apple's machines.

  What that first build is testing, precisely:

  ```
  Xcode Version   Xcode 26.6 (17F113)          identical to build 5
  macOS Version   macOS Tahoe 26.6.2 (25G83)   NOT a beta — the only difference
  ```

  Build 5 was that same Xcode and SDK, built here on macOS 27 beta, and Apple
  refused it with ITMS-90111. So if an Xcode Cloud build is ACCEPTED, the beta
  build machine was the cause and this Mac cannot produce a submittable binary
  until macOS 27 ships. If it is refused the same way, that inference is wrong
  and the toolchain theory needs rethinking from scratch. Either answer is worth
  the build; do not let the result go unread.

- **TWO Xcodes, and the BETA is the submission toolchain. This is the opposite
  of what this note said on 2026-08-29 and the correction cost a rejected
  build.**

  Apple refused build 5 with **ITMS-90111: Unsupported SDK or Xcode version —
  App submissions must use the latest Xcode and SDK Release Candidates (RC)**.
  It was built with `/Applications/Xcode.app`, 26.6, the newest FINAL release,
  which carries the iOS **26.5** SDK. Apple wants the latest SDK, not a released
  one.

  Checked against Apple's own releases page rather than assumed twice: Xcode
  26.6 (June) is the newest final release, Xcode 27 beta 6 is the newest Xcode,
  and **there is no Xcode 27 RC**. So Apple rejected the newest shipping Xcode
  and asked for a candidate that does not exist. The only toolchain with a newer
  SDK is `/Applications/Xcode-beta.app` — 27.0, iOS 27.0 SDK — which is what
  build 6 used.

  So: `DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer` for
  anything going to Apple, until an Xcode 27 RC ships and can be checked. The
  release Xcode stays installed and is still the only one whose `xcodebuild`
  runs without the macOS-27 launch block mattering — but its SDK is now too old
  to submit.

  The reasoning that produced the wrong note is worth keeping because it is
  seductive: "beta SDK bad, release SDK good" is true most of the year and
  false in the weeks before an OS ships, which is exactly when a first
  submission happens.

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

  **But `pnpm test --concurrency=1` is safe and it is the only complete gate.**
  The memory risk here is parallel fan-out, not the suite, and `--concurrency=1`
  removes it: a forced full run of all six packages takes seconds and never went
  near the ceiling. Fully cached it is about two seconds.

  This matters because the targeted habit above has a failure mode that has now
  happened: working in `apps/web`, running `cd apps/web && pnpm vitest run`, and
  never running `packages/config` — where the migration-to-privacy-labels chain
  is enforced. `6e9679f` added a `profiles` column, passed every check I ran,
  and left main red for both lanes until macOS classified it in `035994b`.
  **A `profiles` column is never "one file in question"** — it reaches two store
  data-safety forms through that suite.

  Also worth having, since it cost a wrong conclusion: turbo reports only the
  tasks it EXECUTED, so a mostly-cached run prints "Tasks: 1 successful, 1
  total" and reads exactly like a gate that only covers one package. It is not —
  `--dry=json` lists the plan, and `--force` runs it. I nearly wrote up a hole
  in the gate that does not exist.

  **And the dry plan disagrees with the run by two, also correctly.** It names
  **8** tasks; a forced run executes **6**. `@plusone/db` and `@plusone/types`
  have no `test` script and no test files, so the plan lists the packages while
  the run has nothing to execute for them. Six is the complete number.

  This matters because the dry plan is exactly what somebody reaches for to
  check a run was complete, and 8-versus-6 looks precisely like the hole they
  are checking for. Two counts, both right, and the reassuring one is smaller —
  which is the wrong way round for anybody in a hurry. macOS hit it minutes
  after this note was written.

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

**Kevin has authorised the macOS session into the server lane for server 16–19
only**, said 2026-08-29, because this is one body of work he wants done in
parallel and none of it needs a Mac. It does not open the lane generally — take
16–19 and nothing else, and claim above before starting.

**One session owns `visible_profiles` at a time.** Items 17 and 18 both rebuild
it (17 to carry new columns, 18 for incognito) and a rebuild is a `drop view` —
whichever lands second replays against a shape it did not write. 16 does not
touch it at all, which is why 16 goes first regardless of who takes what.

## Sessions

### 2026-08-29 · macOS · the premium alert, and the gap between two green gates

**Server 18c is done, applied and pushed** — `7e4c93b`, ledger recorded, and
`check:db` green. Detail is in the backlog entry. Three things belong here
instead, because they are about how this repo behaves rather than about the
feature.

**A migration and the code that reads it cannot ship together, and nothing in
the build can see that.** `check:sql` validates the migration, typecheck
validates the TypeScript, and the gap between two green gates is exactly where
this lives. WSL put a live break on the profile page this way an hour before I
finished: PostgREST does not fail narrowly on an unknown column, it fails the
WHOLE request, so one unshipped column returned `data: null` and blanked every
field on the page. Write every read for BOTH deploy orders — mine asks for
`activity_alerts` in its own request so a missing table cannot take the other
forty-two switches down with it, and the cron separates 42883 from a real error
and names the migration in its response.

**`EXPECT` in `verify-schema.mjs` is a hardcoded count and goes red the moment
anything is applied.** Not a warning so much as a thing to know before it looks
like breakage: tables, views, functions, enums. Move it WITH the deltas
attributed — a bump until green would have hidden that six enums arrived from a
migration another session believed it had not applied.

**A peer session's account of production goes stale while you work.** WSL told
me their migration was applied nowhere; it was true when written, and by the
time I read the schema it was applied and in the ledger. I found out from an
enum count, not from a message. Read the database, not the last thing anybody
said about it.

**The Simulator run, and the one thing it changed.** Both today's `apps/web`
changes are now seen in WKWebView — my alert and WSL's filter fold, the real
components, iOS 27.0. The fold arrives open on `?kids=none` and the radius
select is 16px. Neither is checked in the TWA, which is a different engine.

**The 16px rule cannot be checked statically, and `design-system.test.ts` reads
as though it can.** It scans for a literal `text-[Npx]` inside a control's tag,
so a field that INHERITS a small size is invisible to it. Measured at runtime
every text-and-select field is >= 16px and the only two under are checkboxes,
which raise no keyboard and do not zoom — so nothing is broken. But the gate is
narrower than its name, and a runtime measurement is the only thing that knows.

**Scripting the shell without a rebuild.** `capacitor.config.json` can be
edited INSIDE the installed `App.app` in the simulator's container, then
`terminate` + `launch` — no Xcode build, no reinstall, seconds rather than
minutes. Copy the original aside first and put it back; the repo's own copy is
never touched. That is a good deal faster than the technique the older note
describes, and it is what made a three-round measure-and-refine loop cheap.

**`next dev` failed with "Failed to open database" on the first try**, which is
the corrupt Turbopack cache the machine notes already describe. `rm -rf
apps/web/.next` and it started. Worth knowing the note is accurate — it cost
nothing because it was written down.

**18b went on to land too** — per-photo privacy, applied, `43a35dc`. Its own
reasoning is in the backlog entry. The one thing here rather than there: the
right premium gate is a consequence of HOW A TABLE WAS GRANTED, and this schema
does both. `profile_photos` carries a whole-table update grant so a member can
PATCH any column on their own rows and a check in a server action is decoration
— that one needs a trigger. `profiles` has no such grant, so 18a could simply
never grant the column and write through a definer function, which is the
stronger shape. **Read `information_schema.role_table_grants`, never the
migration that created the table** — 20260826000200 exists precisely because a
table's grants are not what its creating file says, which makes that file the
one source guaranteed to be able to lie about this.

**Staging a state in the production database was proposed and refused**, and
the refusal is the durable part. WSL suggested forcing a column as owner so a
lapsed-premium screen could be photographed. BACKLOG shells 11 had already
settled it — "inventing one in the production database to watch a button render
is a worse idea than the bug" — and it was a real member's row. Rendering the
component directly with props answered the same question. Worth knowing the
answer exists, because the request is a reasonable-sounding one and it will
come again.

**A test nobody has watched fail is a test nobody has a reason to trust.** Three
separate instances of this turned up in one afternoon: a labels scan that read
zero columns and passed, a grant assertion satisfied by the migration's own
COMMENT saying the right sentence, and a 16px gate blinded by a class hoisted
into a constant. Give any source-scanning test a floor on what it actually read,
strip comments before matching, and break it once on purpose.

Everything this block used to say about how to work is in the machine notes
above now — read the artifact not the claim, the two sabotage traps, the
floor-and-strip-comments rules for source-scanning tests. They are standing
rules, and a session block is one of three under a delete-below rule, so a rule
kept here has an expiry date. That was the `debugPanel` failure and both of us
had committed it in our own blocks by the end of the day.

**Left off:** tree clean, five gates green on a forced run (3039 tests, nothing
cached), nothing in flight, nothing claimed in either lane. All five
PREMIUM_INCLUDES promises are built and applied.

Everything outstanding is Kevin's and none of it is code — the device, the App
Store Connect log (Kevin 18, and read the log BEFORE touching the build number),
Play's app setup, and counsel. The Play catalogue is unread since the 27th and
the phone is unreachable from both machines.

This paragraph previously said two things were waiting on Kevin that he had
decided hours earlier. It was rewritten rather than appended to, which is the
whole point of this file being a whiteboard.

### 2026-08-29 · WSL · the filters, the premium tier, and one technique

**Server 16, 17, 18a, 18d and 19 are done, applied and pushed.** Browse went
from three filters to nineteen with a paid split; the profile gained eleven
columns including religion, politics and weight; incognito browse exists. Four
migrations are LIVE — 20260829000100, 000200, 000300, 000400 — ledger re-run,
`check:db` green. **All five `PREMIUM_INCLUDES` promises are now built**, from
one this morning.

Detail is in the commits and in BACKLOG 16–20. The standing rules this session
produced have moved into the machine notes above, where they are not on a
three-entry countdown — the deploy-order/PostgREST trap, `--dry-run` versus
`check:sql`, the `git checkout` sabotage trap, and the failing-versus-passing
sabotage asymmetry. What is left here is only where I stopped.

**Read the artifact, not the claim — now a machine note above, once.** It was
in both session blocks and nowhere durable, which made the one rule every
finding today came from the only one on a delete date. macOS caught that; the
copy that was here is gone rather than summarised, because a summary beside the
real thing is two records that will disagree.

Worth keeping only as the shape to recognise: a labels suite that had never seen
a column added by `alter table`; a 16px scan blinded twice by refactors, once by
me; an `is_premium` RPC resolving to null on permission denied, so every paying
member would have read as free; a backlog entry calling finished work blocked; a
removal note with a delete date on it; and a locked filter pixel-identical to a
live one. All had been passing for days or weeks, and every one failed silently
in the comfortable direction.

**And once in the other direction, which is the expensive one.** Checking
macOS's fix five minutes ago, my grep was case-sensitive against a capitalised
heading and returned nothing. I was a sentence from telling them the rule was
missing and re-adding a duplicate — inventing the exact defect I was checking
for. A false negative costs a bug; a false positive costs a day and leaves the
tree worse.

**Left off clean.** Full forced run — `turbo run test --concurrency=1 --force`,
6 tasks, nothing cached, 3040 tests — plus typecheck, lint, format:check,
check:sql and check:db. Nothing claimed. `adb` is NOT connected; the phone drops
off and both ports rotate every time the dialog opens, so the TWA screenshot and
the Play re-read both need Kevin with the device. The Play diagnostic now needs
`?diag=1` on the URL.

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
debugging stays on. (That address is stale — the phone was at
`192.168.50.122` on the 29th, and both ports rotate every time the dialog is
opened, so it always needs Kevin.) The on-page diagnostic panel is **now
backlog server 20** rather than a line in a session block that this file's own
three-block rule was about to delete.
