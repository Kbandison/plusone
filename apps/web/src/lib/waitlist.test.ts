import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { type WaitlistRow, countByMetro, testerList } from "./waitlist";

import {
  BETA_INSTALL,
  BETA_LINKS,
  METROS,
  PLAY_TESTER_PASTE,
  PLAY_TRACK,
  betaInstallFor,
  WAITLIST_EMAIL,
  WAITLIST_REMINDER_AFTER_DAYS,
  WAITLIST_UNCONFIRMED_TTL_DAYS,
} from "@plusone/config";

const SRC = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

/** Comments stripped, so a guard cannot be satisfied by prose describing it. */
/**
 * Source with its comments out — and it must not eat string literals.
 *
 * The block pattern was `/\*[\s\S]*?\*\/` anywhere, which treats the `/*` inside
 * a path glob like `"/app/*"` as a comment opener and swallows everything up to
 * the next `*\/`. The association file is nothing BUT path globs, so any
 * docblock added below that array silently truncates it — and every assertion
 * about which paths are claimed would then be reading an empty string.
 *
 * Found during the Cache Components trial, which added such a docblock; the
 * trial was reverted and this was not, because the bug is real either way and
 * only waiting for the next comment written under that array.
 *
 * A real block comment here starts a line, so the opener is anchored to
 * line-start whitespace. The FLOOR beside each use is the only reason anybody
 * noticed: the negative assertions all passed happily on "".
 */
const code = (p: string) =>
  read(p)
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

/**
 * The same source with its import block removed.
 *
 * Every ordering assertion below needs this, and the first version did not have
 * it: `indexOf("acceptBetaInvite")` found the IMPORT at the top of the file, so
 * "accepted after verifying" compared position 389 against 2158 and failed on
 * code that was correct. A scan that reads the import list is measuring the
 * wrong thing in both directions — it would equally have PASSED a file that
 * imported in the right order and called in the wrong one.
 */
const body = (p: string) => code(p).replace(/^import[\s\S]*?;\s*$/gm, "");

function tsx(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(join(SRC, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) tsx(rel, acc);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) acc.push(rel);
  }
  return acc;
}

const files = tsx("app");

/**
 * A function body, sliced to the next top-level declaration.
 *
 * NOT `/function name[\s\S]*?\n}/`. A destructured parameter list closes with
 * its own `\n}`, so a lazy match stops there and returns a hundred characters
 * of signature — and every assertion made against it then passes on nothing.
 * That has now cost two guards in this file and one in photos.test.ts.
 */
function fnBody(source: string, declaration: string): string {
  const start = source.indexOf(declaration);
  if (start === -1) return "";
  // Stops at ANY top-level declaration, not just the next function. Stopping
  // only at `function` overshot past an intervening `export interface` and
  // pulled its fields into the slice — which made an assertion about what this
  // function does fail on a word in a type two declarations away.
  const next = source
    .slice(start + 1)
    .search(/\n(export )?(async )?(function|interface|const|type|class) /);
  return next === -1 ? source.slice(start) : source.slice(start, start + 1 + next);
}

describe("the closed beta has exactly one door", () => {
  it("finds the source at all", () => {
    // A silent zero would make every scan below pass forever.
    expect(files.length).toBeGreaterThan(40);
  });

  /**
   * `signInWithOtp` is what mints an account, and `shouldCreateUser` is the
   * switch. Anywhere it is called WITHOUT that option defaults to true, which
   * would be a second, ungated way in.
   */
  it("no call to signInWithOtp leaves shouldCreateUser at its default", () => {
    const offenders: string[] = [];
    let calls = 0;
    for (const f of files) {
      // Two traps here, both of which silently hid a call site, and both of
      // which the floor below caught rather than a reviewer:
      //
      //   · Anchoring on a trailing `;` missed /sign-in's first branch, which
      //     is inside a ternary and ends `})` with no semicolon at all.
      //   · Then CONSUMING the 300-char window swallowed the second call,
      //     which sits inside the first one's window — matchAll resumes at
      //     lastIndex, so two nearby calls read as one.
      //
      // A lookahead matches the marker and consumes nothing, so the window is
      // read without moving past what follows it.
      for (const match of code(f).matchAll(/signInWithOtp\((?=([\s\S]{0,300}))/g)) {
        calls += 1;
        if (!/shouldCreateUser/.test(match[1] as string)) offenders.push(f);
      }
    }
    // The floor. Without it a renamed method would empty this scan and it
    // would keep reporting success for a check it no longer performs.
    expect(calls, "found no signInWithOtp calls — this scan has gone blind").toBeGreaterThanOrEqual(
      3,
    );
    expect(offenders, "an ungated path to creating an account").toEqual([]);
  });

  it("/sign-in still refuses to create, on both branches", () => {
    const actions = code("app/sign-in/actions.ts");
    const flags = [...actions.matchAll(/shouldCreateUser:\s*(\w+)/g)].map((m) => m[1]);
    // Phone and email. Both false, and neither reading a variable — this
    // screen has no business creating anything under any condition.
    expect(flags).toEqual(["false", "false"]);
  });

  /**
   * SIGNUP IS OPEN since 2026-09-13, and this records the reversal rather than
   * deleting the assertion.
   *
   * It read `shouldCreateUser: invited`, with the cookie checked against the
   * database rather than trusted — the gate's whole design. Kevin reopened with
   * counsel review still outstanding, which is his call; BACKLOG 22 is the
   * checklist this followed.
   *
   * The property worth keeping is the one that made the gate safe and now makes
   * the absence of it unremarkable: creation was never gated on a COOKIE. If
   * signup is ever closed again, it must go back to a database check and not to
   * `Boolean(cookie)`, which anybody can set.
   */
  it("/onboarding/phone creates an account for anybody", () => {
    const actions = code("app/onboarding/phone/actions.ts");
    expect(actions).toMatch(/shouldCreateUser:\s*true/);
    expect(actions).not.toMatch(/shouldCreateUser:\s*Boolean\(/);
    expect(actions).not.toMatch(/shouldCreateUser:\s*invited/);
  });

  it("still spends and marks the invitation, though it no longer opens the door", () => {
    // An invitation that was already issued must not be passable round, and
    // `joined_in_beta` is the only record of who arrived during the beta —
    // unrecoverable afterwards, since the waitlist is keyed by email and an
    // account by phone. BACKLOG 29.
    const actions = code("app/onboarding/phone/actions.ts");
    expect(actions).toMatch(/acceptBetaInvite/);
    expect(actions).toMatch(/joined_in_beta/);
  });

  it("spends the invitation only after the code verifies", () => {
    const actions = body("app/onboarding/phone/actions.ts");
    const verifyAt = actions.indexOf("verifyOtp");
    const acceptAt = actions.indexOf("acceptBetaInvite");
    expect(verifyAt).toBeGreaterThan(-1);
    expect(acceptAt).toBeGreaterThan(-1);
    // Accepting before verifying burns an invitation for anybody who reaches
    // the code screen and stops — and nothing in the product can issue another.
    expect(acceptAt).toBeGreaterThan(verifyAt);
  });
});

describe("the beta cookie is carried, not trusted", () => {
  const proxy = code("proxy.ts");

  it("sets it from a narrow path pattern", () => {
    expect(proxy).toMatch(/plusone_beta/);
    expect(proxy).toMatch(/\\\/beta\\\/\(\[0-9a-f\]\{16\}\)/);
  });

  it("keeps it separate from the referral cookie", () => {
    // A referral is minted by any member for anyone; a beta invitation is the
    // operator admitting somebody. One namespace would let a member mint a way
    // through the gate.
    expect(proxy).toMatch(/plusone_ref/);
    expect(proxy.match(/plusone_beta/g)?.length).toBe(1);
  });

  it("is httpOnly, secure and same-site", () => {
    const block = /plusone_beta[\s\S]{0,320}?\}\);/.exec(proxy)?.[0] ?? "";
    expect(block).toMatch(/httpOnly:\s*true/);
    expect(block).toMatch(/secure:\s*true/);
    expect(block).toMatch(/sameSite:\s*"lax"/);
  });

  it("makes no authorisation decision in the proxy", () => {
    // The file's own rule: "a proxy that starts making authorisation decisions
    // is a second place for them to be wrong."
    expect(proxy).not.toMatch(/betaInviteIsOpen/);
    expect(proxy).not.toMatch(/redirect\(/);
  });
});

describe("leaving the list cannot be triggered by a link prefetch", () => {
  it("the delete lives in a server action, not a GET route", () => {
    const action = code("app/waitlist/leave/actions.ts");
    expect(action).toMatch(/"use server"/);
    expect(action).toMatch(/leaveWaitlist/);

    // The page renders; it must not delete. Mail scanners, chat previews and
    // link prefetchers all issue GETs, and an unsubscribe they trigger is
    // invisible to the person it removes.
    const page = code("app/waitlist/leave/page.tsx");
    expect(page).not.toMatch(/leaveWaitlist/);
  });
});

describe("nothing offers a door that does not open", () => {
  /**
   * During the closed beta, `/onboarding/phone` refuses anybody without an
   * invitation. A link to it from a public page is a button leading to a
   * refusal — and the invited arrive from /beta/<code>, which sets the cookie
   * on the way.
   */
  it("public pages link to signup, now that it is open", () => {
    /**
     * Both files of the invite surface, which is the only place a link to
     * signup is correct — an invited member arrives from /beta/<code>, which
     * set the cookie the gate reads.
     *
     * `install.tsx` joined the list when the browser link moved into it from
     * the page: it used to be a primary button labelled "Start" sitting ABOVE
     * the install steps, so the most prominent control on an invitation to
     * install an app opened the web app without saying so.
     */
    // INVERTED 2026-09-13. It asserted that no public page linked here, because
    // a link to a refusal is a button that goes nowhere. With the gate open the
    // opposite is required: the front door has to be reachable from the front
    // page, or the only route in is an invitation nobody is issuing any more.
    for (const f of ["app/page.tsx", "app/site-header.tsx", "app/sign-in/sign-in-form.tsx"]) {
      expect(code(f), f).toMatch(/href="\/onboarding\/phone"/);
    }
  });

  it("the waitlist survives, because it was never only a gate", () => {
    // It is what turns COPY.drop.thin from an apology into a plan, and it is
    // still how somebody in an area with nobody in it says where they are.
    expect(code("app/waitlist/page.tsx").length).toBeGreaterThan(0);
    expect(files.some((f) => /href="\/waitlist"/.test(code(f)))).toBe(true);
  });
});

describe("the waitlist table is reached only through the service client", () => {
  it("no page or action queries it directly", () => {
    const offenders = files.filter((f) => /from\("waitlist"\)/.test(code(f)));
    // It has no RLS policies and no grants, so a member-context query returns
    // nothing at all — silently. Everything goes through lib/waitlist.ts.
    expect(offenders).toEqual([]);
  });

  it("the admin action checks is_admin itself", () => {
    const action = code("app/admin/waitlist/actions.ts");
    // Every other admin action leans on is_admin() inside an RPC. This one
    // cannot: the service client bypasses RLS, so there is no wall behind it.
    expect(action).toMatch(/rpc\("is_admin"\)/);
    expect(action).toMatch(/redirect\("\/"\)/);

    const admin = body("app/admin/waitlist/actions.ts");
    const assertAt = admin.indexOf("assertAdmin()");
    const inviteAt = admin.indexOf("inviteFromWaitlist");
    expect(assertAt).toBeGreaterThan(-1);
    expect(inviteAt).toBeGreaterThan(assertAt);
  });

  it("the store-account action re-checks the code rather than trusting the form", () => {
    const action = code("app/beta/[code]/actions.ts");
    // Otherwise it is an unauthenticated write keyed on a value the browser
    // supplies — and the codes are what the beta gate accepts.
    expect(action).toMatch(/betaInviteIsOpen/);
  });
});

describe("the library keeps its promises about what it returns", () => {
  const lib = code("lib/waitlist.ts");

  it("join tells the caller nothing", () => {
    // A form that answers "already on the list" differently from "added" is a
    // membership oracle for an HSV and HIV app.
    expect(lib).toMatch(/export async function joinWaitlist\([\s\S]{0,200}?\): Promise<void>/);
  });

  it("never invites an unconfirmed address by default", () => {
    const invite = fnBody(lib, "export async function inviteFromWaitlist");
    expect(invite.length).toBeGreaterThan(200);
    // Kevin's override 2026-09-14 made this conditional on a named argument.
    // The refusal is still the default and still one line.
    expect(invite).toMatch(/if \(!row\.confirmed_at && !options\.includeUnconfirmed\) continue/);
  });

  it("spends an invitation atomically", () => {
    const accept = fnBody(lib, "export async function acceptBetaInvite");
    // Two devices racing the same link must produce one account.
    expect(accept).toMatch(/\.is\("accepted_at", null\)/);
  });

  it("deletes on leaving rather than flagging", () => {
    const leave = fnBody(lib, "export async function leaveWaitlist");
    expect(leave).toMatch(/\.delete\(\)/);
    expect(leave).not.toMatch(/update\(/);
  });
});

describe("a store identity is only held for somebody who asked to test", () => {
  const lib = code("lib/waitlist.ts");

  it("nulls both fields when the testing box is not ticked", () => {
    // Untick and the reason for holding a Google account or an Apple ID has
    // gone with it. Keeping the value because it is already in the row is how
    // a table quietly outgrows its justification.
    const helper = fnBody(lib, "function storeFields");
    expect(helper.length).toBeGreaterThan(100);
    expect(helper).toMatch(
      /if \(!wantsBeta\) return \{ store_platform: null, store_account_email: null \}/,
    );
  });

  it("the join action reads them only when the box is ticked", () => {
    // Reading them regardless would let a crafted POST store a Google account
    // for somebody who never opted in — the one thing the conditional fields
    // exist to prevent, and a form is not a wall.
    const action = code("app/waitlist/actions.ts");
    const guard = action.indexOf("if (wantsBeta) {");
    const platformRead = action.indexOf('formData.get("platform")');
    const emailRead = action.indexOf('formData.get("storeEmail")');
    expect(guard).toBeGreaterThan(-1);
    expect(platformRead).toBeGreaterThan(guard);
    expect(emailRead).toBeGreaterThan(guard);
  });

  it("never waits on the tester having ACCEPTED", () => {
    // The oldest version required accepted_at, so somebody could be added to a
    // store list only after following their invitation and filling in a second
    // form. The account arrives with the signup now, so nothing here should ever
    // consult it again.
    //
    // This used to assert `invited_at` was absent too. It is legitimately back —
    // the function partitions ON it, into a queue and a roster, rather than
    // gating on it. That distinction is invisible to a source scan, which is why
    // the rule it was protecting moved to the behavioural tests below: they pass
    // real rows and cannot be fooled by where a field appears.
    const fn = fnBody(lib, "export function testerList");
    expect(fn).not.toMatch(/r\.accepted_at/);
  });

  it("still refuses to list anybody who did not ask to test", () => {
    // Renamed rather than deleted: it used to say "uninvited" and now lists
    // exactly those, so the old name asserted the opposite of the rule. What it
    // was really protecting is that nobody reaches a store list without having
    // asked — which survives, and is the only gate left on this function.
    const fn = fnBody(lib, "export function testerList");
    expect(fn).toMatch(/wants_beta/);
  });
});

describe("the beta alert reaches admins and names nobody", () => {
  const lib = code("lib/waitlist.ts");

  it("fires on confirmation, not on join", () => {
    // An unconfirmed row is somebody who never asked — possibly somebody else's
    // address typed by a stranger. Alerting on join makes this endpoint a
    // nuisance generator aimed at whoever runs the beta.
    const join = fnBody(lib, "export async function joinWaitlist");
    expect(join.length).toBeGreaterThan(400);
    expect(join).not.toMatch(/alertAdminsOfBetaSignup/);

    const confirm = fnBody(lib, "export async function confirmWaitlist");
    expect(confirm).toMatch(/alertAdminsOfBetaSignup/);
  });

  it("fires only for a beta signup, not for every waitlist row", () => {
    const confirm = fnBody(lib, "export async function confirmWaitlist");
    expect(confirm).toMatch(/if \(wantsBeta\) await alertAdminsOfBetaSignup\(\)/);
  });

  it("sends to the admin roster and to nobody else", () => {
    const fn = fnBody(lib, "async function alertAdminsOfBetaSignup");
    expect(fn.length).toBeGreaterThan(200);
    expect(fn).toMatch(/from\("admin_users"\)/);
    expect(fn).toMatch(/notify\("beta_signup", admins\)/);
  });

  it("passes no address, id or count to the notification", () => {
    // An admin's lock screen is still a lock screen: read over a shoulder, on a
    // shared desk, in front of whoever is in the room. The address is one tap
    // away in /admin/waitlist, behind a session and a roster check.
    const fn = fnBody(lib, "async function alertAdminsOfBetaSignup");

    // notify() takes (event, recipients, refs). Exactly two arguments means no
    // actor and no subject travel with it — and the template itself carries no
    // interpolation, so there is nothing for one to fill.
    expect(fn).toMatch(/notify\("beta_signup", admins\);/);

    // The roster read takes the id and nothing else. Selecting the row would
    // put an address in scope one edit away from the payload.
    expect(fn).toMatch(/\.select\("user_id"\)/);
    expect(fn).not.toMatch(/select\("\*"\)/);
  });

  it("cannot turn a confirmed signup into an error", () => {
    // A courtesy attached to something that already succeeded.
    const fn = fnBody(lib, "async function alertAdminsOfBetaSignup");
    expect(fn).toMatch(/try \{/);
    expect(fn).toMatch(/catch/);
  });
});

describe("the invitation does not ask what signup already answered", () => {
  const install = code("app/beta/[code]/install.tsx");
  const page = code("app/beta/[code]/page.tsx");

  it("hides the platform picker once the account is settled", () => {
    // The bug: the account FIELD was suppressed when we knew it, but the
    // platform radios were unconditional — so an invited tester opened their
    // email and met a form asking a question they had already answered on the
    // join page. A second form is what moving the question to signup removed.
    expect(install).toMatch(/settled \? null : \(\s*<fieldset/);
    expect(install).toMatch(/const settled =/);
  });

  it("lets somebody say they are on a different phone", () => {
    // The escape that makes hiding the picker safe: what we know can be wrong.
    expect(install).toMatch(/setPicking\(true\)/);
    expect(install).toMatch(/differentPhone/);
  });

  it("puts the browser link below the steps and names the browser", () => {
    // It was a primary button labelled "Start" ABOVE them, so the most
    // prominent control on an invitation to install an app opened the web app
    // without saying where it went.
    const stepsAt = install.indexOf("chosen.steps");
    const browserAt = install.indexOf("openInBrowser");
    expect(stepsAt).toBeGreaterThan(-1);
    expect(browserAt).toBeGreaterThan(stepsAt);
    expect(install).not.toMatch(/buttonClass\("primary"[^)]*\)[^<]*>\s*\{C\.start\}/);
  });

  it("the page no longer renders its own Start button", () => {
    expect(page).not.toMatch(/C\.start/);
  });

  it("only offers the Android links once the account is settled", () => {
    // The opt-in page tells an unlisted person the programme is unavailable and
    // the store says the app cannot be found — two dead ends that look like our
    // mistake.
    expect(install).toMatch(/platform === "android" && \(settled \|\| saved\)/);
  });
});

describe("the signed-out pages share one shell", () => {
  /**
   * Five pages spelled the same `<main>` class string by hand, which is what
   * the "one definition per primitive" test guards against elsewhere — and it
   * was only noticed because a complaint about wasted vertical space would
   * otherwise have had to be fixed five times.
   *
   * The two variants are the point, not the deduplication: a page that says
   * something is centred, a page with something to DO starts near the top,
   * because centring a form wastes the top third of a tall phone and pushes the
   * first thing to read below where somebody is looking.
   */
  const shells = [
    ["app/waitlist/page.tsx", "act"],
    ["app/waitlist/manage/page.tsx", "act"],
    ["app/beta/[code]/page.tsx", "act"],
    ["app/waitlist/confirm/page.tsx", "read"],
    ["app/waitlist/leave/page.tsx", "read"],
    ["app/i/[code]/page.tsx", "read"],
  ] as const;

  it("none of them spells the page shell by hand", () => {
    for (const [file] of shells) {
      const source = code(file);
      expect(source, `${file} still hand-spells the shell`).not.toMatch(/min-h-\[100dvh\]/);
      expect(source, `${file} does not use PublicShell`).toMatch(/<PublicShell/);
    }
  });

  it("gives the pages with something to do the top-aligned variant", () => {
    for (const [file, variant] of shells) {
      const source = code(file);
      const act = /<PublicShell[^>]*variant="act"/.test(source);
      expect(act, `${file} should be ${variant}`).toBe(variant === "act");
    }
  });

  it("only the act variant drops the centring", () => {
    // The rule lives in one place now, so this checks the place rather than
    // six call sites.
    const ui = code("app/ui.tsx");
    expect(ui).toMatch(/variant === "read" \? "justify-center py-24" : "pt-10 pb-16"/);
  });
});

describe("an invitation has to survive the jump between two engines", () => {
  /**
   * Read directly rather than through `betaInstallFor`, which picks between the
   * invitation variant and the public-link one. The invitation variant is the
   * one this is about: it is the path that carries a cookie.
   */
  const ios = BETA_INSTALL.ios;
  const android = BETA_INSTALL.android;

  const aasa = code("app/.well-known/apple-app-site-association/route.ts");
  const components = /const COMPONENTS[\s\S]*?\n\];/.exec(aasa)?.[0] ?? "";

  it("finds the association file's components at all", () => {
    // The floor. Every assertion below is about what this list does NOT
    // contain, and an empty string satisfies all of them silently.
    expect(components).toMatch(/\/app\/\*/);
    expect(components.length).toBeGreaterThan(80);
  });

  it("claims /beta/*, so an invitation reaches the shell's cookie jar", () => {
    // Inverted rather than deleted, together with the copy assertion below —
    // they were written as a coupled pair and they still are, pointing the
    // other way. The cookie proxy.ts sets is the whole invitation, and where
    // the link opens decides which engine holds it.
    expect(components).toMatch(/\/beta\/\*/);
  });

  it("tells an iOS tester to install FIRST and re-open the invitation last", () => {
    // Claiming the path does not help somebody who taps the link before the app
    // exists: iOS cannot open an app that is not installed, so they get Safari
    // and installing afterwards does not move the cookie across. The order is
    // the fix, not the claim on its own.
    for (const steps of [ios.steps, ios.pendingSteps]) {
      const all = steps.join(" ");
      expect(all).toMatch(/TestFlight/);
      // The last step is the one that puts the invitation in the right jar.
      expect(steps[steps.length - 1]).toMatch(/invitation link again/i);
      // And it comes AFTER installing, which is the property that matters.
      const install = steps.findIndex((step) => /Install Plus One/i.test(step));
      expect(install).toBeGreaterThan(-1);
      expect(steps.length - 1).toBeGreaterThan(install);
    }
  });

  it("asks about the TWA too, because the invitation opens in it", () => {
    // inNativeShell cannot see a TWA and should not — a TWA is real Chrome.
    // But the Android intent filter carries no path constraint, so once
    // assetlinks is verified every path on the host opens in the app, and an
    // Android tester who had already installed was shown how to install it.
    // The same screen this block exists to prevent, one engine over.
    const install = code("app/beta/[code]/install.tsx");
    expect(install).toMatch(/inTwa\(\)/);
    expect(install).toMatch(/inTwa\(\)\s*\|\|\s*inNativeShell\(\)/);
  });

  it("and the Android manifest still has no path constraint, which is why", () => {
    // The floor under the assertion above: it is only true while every path on
    // the host opens in the app. If a path filter is ever added, the reasoning
    // in install.tsx needs rereading rather than the check quietly outliving it.
    const manifest = readFileSync(
      join(SRC, "../../../apps/android/app/src/main/AndroidManifest.xml"),
      "utf8",
    );
    expect(manifest).toMatch(/android:host/);
    expect(manifest).not.toMatch(/android:path/);
  });

  it("does not tell an Android tester the same thing, because a TWA shares Chrome's jar", () => {
    // The mirror, and the reason this suite is not vacuous: if the assertion
    // above passed for both platforms it would be matching something generic
    // rather than the instruction that was added for one engine.
    expect(android.steps[0]).not.toMatch(/browser/i);
  });
});

describe("the track testers are pasted into is the track their link opts them into", () => {
  it("the opt-in URL form agrees with PLAY_TRACK", () => {
    // Play uses two different URL shapes and only one works per track:
    //   closed / open  ->  play.google.com/apps/testing/<package>
    //   internal       ->  play.google.com/apps/internaltest/<id>
    // Sending one track's link to somebody on the other answers "Plus One is
    // unavailable" with no reason given, which is the failure
    // BETA_INSTALL.android.accountHint describes arriving from our side.
    const url = BETA_LINKS.android.optIn;
    if (PLAY_TRACK === "internal") {
      expect(url).toMatch(/\/apps\/internaltest\//);
    } else {
      expect(url).toMatch(/\/apps\/testing\//);
      expect(url).not.toMatch(/internaltest/);
    }
  });

  it("the admin screen names the track from PLAY_TRACK rather than a literal", () => {
    // It carried "Internal testing" as a hardcoded string while PLAY_TRACK said
    // closed and the shipped link was the closed one. PLAY_TRACK had no readers
    // at all, which is what let them disagree — a constant nothing consults
    // cannot contradict anything until somebody trusts it.
    const admin = code("app/admin/waitlist/page.tsx");
    expect(admin).toMatch(/PLAY_TESTER_PASTE/);
    expect(admin).not.toMatch(/Internal testing|Closed testing/);
  });

  it("and PLAY_TESTER_PASTE actually names the live track", () => {
    // The floor. Both assertions above pass against a constant that resolves to
    // the wrong half of the map, so check the resolved value, not its shape.
    expect(PLAY_TESTER_PASTE.heading.toLowerCase()).toContain(PLAY_TRACK);
    expect(PLAY_TESTER_PASTE.path.toLowerCase()).toContain(PLAY_TRACK);
  });
});

describe("a tester can be added to a store list before their invitation goes out", () => {
  /** Only the fields testerList reads; the rest of WaitlistRow is irrelevant here. */
  const row = (over: Partial<WaitlistRow>): WaitlistRow =>
    ({
      id: "r",
      email: "a@example.com",
      metro: "houston",
      wants_beta: true,
      confirmed_at: "2026-09-01T00:00:00Z",
      invited_at: null,
      accepted_at: null,
      store_platform: "android",
      store_account_email: "a@gmail.com",
      created_at: "2026-09-01T00:00:00Z",
      ...over,
    }) as WaitlistRow;

  it("includes somebody confirmed and NOT yet invited", () => {
    // The whole point. The store list has to be populated before the invitation
    // email goes, because that email is what tells them to install, and Play
    // answers an unlisted account with "unavailable" and no reason.
    const { addresses } = testerList([row({ invited_at: null })], "android");
    expect(addresses).toEqual(["a@gmail.com"]);
  });

  it("moves them out of the queue once invited, into the roster", () => {
    // The box is a work queue: inviting is what marks the job done, so an
    // invited tester must not keep reappearing in the list of people to add.
    const invited = [row({ invited_at: "2026-09-01T01:00:00Z" })];
    expect(testerList(invited, "android").addresses).toEqual([]);
    expect(testerList(invited, "android", "invited").addresses).toEqual(["a@gmail.com"]);
  });

  it("loses nobody in the split", () => {
    // The property the two-box design rests on. Somebody invited but never
    // actually added to a track is the one person who most needs finding, and
    // a queue that only shrinks would hide exactly them.
    const rows = [
      row({ id: "a", invited_at: null, store_account_email: "a@gmail.com" }),
      row({ id: "b", invited_at: "2026-09-01T01:00:00Z", store_account_email: "b@gmail.com" }),
    ];
    const queue = testerList(rows, "android").addresses;
    const roster = testerList(rows, "android", "invited").addresses;
    expect([...queue, ...roster].sort()).toEqual(["a@gmail.com", "b@gmail.com"]);
    // And in exactly one each — a row in both would be pasted twice.
    expect(queue.filter((e) => roster.includes(e))).toEqual([]);
  });

  it("excludes anybody who did not ask to test", () => {
    // The floor on how wide this got. Confirmed is enforced upstream by
    // confirmedWaitlist; wants_beta is enforced here, and without it a plain
    // waitlist signup would be handed to a store.
    expect(testerList([row({ wants_beta: false })], "android").addresses).toEqual([]);
  });

  it("keeps the platforms apart", () => {
    expect(testerList([row({ store_platform: "ios" })], "android").addresses).toEqual([]);
  });

  it("counts somebody with no store account as missing rather than dropping them silently", () => {
    const { addresses, missing } = testerList([row({ store_account_email: null })], "android");
    expect(addresses).toEqual([]);
    expect(missing).toBe(1);
  });
});

describe("countByMetro totals what it is given, whatever shape it walks in", () => {
  const r = (over: Partial<WaitlistRow>): WaitlistRow =>
    ({
      id: "x",
      email: "e@example.com",
      metro: "houston",
      wants_beta: false,
      confirmed_at: "2026-09-01T00:00:00Z",
      invited_at: null,
      accepted_at: null,
      store_platform: null,
      store_account_email: null,
      created_at: "2026-09-01T00:00:00Z",
      ...over,
    }) as WaitlistRow;

  it("counts each column independently", () => {
    const counts = countByMetro([
      r({ metro: "houston", wants_beta: true }),
      r({ metro: "houston", wants_beta: true, invited_at: "2026-09-01T01:00:00Z" }),
      r({
        metro: "houston",
        invited_at: "2026-09-01T01:00:00Z",
        accepted_at: "2026-09-01T02:00:00Z",
      }),
      r({ metro: "atlanta", wants_beta: true }),
    ]);
    const houston = counts.find((c) => c.metro === "houston");
    expect(houston).toMatchObject({ confirmed: 3, wantsBeta: 2, invited: 2, accepted: 1 });
    expect(counts.find((c) => c.metro === "atlanta")).toMatchObject({
      confirmed: 1,
      wantsBeta: 1,
    });
  });

  it("reads the confirmed column rather than counting whatever arrived", () => {
    // `confirmed` was `+= 1` per row, which was right while the only caller
    // passed confirmedWaitlist() and became a lie the moment one passed
    // everybody — a field named for a fact, holding a count of rows.
    const counts = countByMetro([
      r({ metro: "houston" }),
      r({ metro: "houston", confirmed_at: null }),
      r({ metro: "houston", confirmed_at: null }),
    ]);
    expect(counts.find((c) => c.metro === "houston")).toMatchObject({
      confirmed: 1,
      unconfirmed: 2,
    });
  });

  it("still returns every metro, including the empty ones", () => {
    // The caller hides the zeroes. A metro missing from the list would read as
    // zero anyway, so this is about the contract rather than the display —
    // rewriting it as a single pass is exactly the change that would drop them.
    const counts = countByMetro([]);
    expect(counts.length).toBe(METROS.length);
    expect(counts.every((c) => c.confirmed === 0)).toBe(true);
  });
});

/**
 * The cohort, recorded at the one moment it is knowable.
 *
 * `waitlist.accepted_at` says an invitation was spent. It cannot say by WHICH
 * account — the waitlist has no user_id and must not get one, since
 * WAITLIST_NEVER bans `phone` as a second identifier and a user_id is stronger
 * still: it binds an address that merely asked about an HSV and HIV app to a
 * member account. So the account carries the mark instead, and OTP verification
 * is the only place both halves are in hand. Backlog 22 reopens signup and from
 * that moment nobody arriving leaves a trace at all.
 */
describe("who came in during the beta", () => {
  const actions = body("app/onboarding/phone/actions.ts");
  const MIGRATIONS = join(SRC, "..", "..", "..", "supabase", "migrations");
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const allSql = files.map((f) => readFileSync(join(MIGRATIONS, f), "utf8")).join("\n");
  const migration = files.find((f) => f.includes("who_came_in_during_the_beta"));

  it("finds the migrations, so the negatives below are not vacuous", () => {
    // The floor. Every assertion in this block that asserts an ABSENCE would
    // pass happily against an empty string, and this file already has a
    // docblock about exactly that failure.
    expect(files.length).toBeGreaterThan(50);
    expect(allSql).toMatch(/create table if not exists public\.waitlist/);
  });

  it("has a migration adding the column", () => {
    expect(migration).toBeTruthy();
    expect(readFileSync(join(MIGRATIONS, migration!), "utf8")).toMatch(
      /add column if not exists joined_in_beta boolean not null default false/,
    );
  });

  it("grants it to nobody, so a member cannot mint their own claim", () => {
    // profiles carries NO whole-table grant — column-level only, read off
    // information_schema rather than inferred: 33 insert, 42 select, 32 update.
    // So the column is unreachable unless granted, and granting it would let a
    // member set the flag that decides who gets a premium grant.
    expect(allSql).not.toMatch(/grant\s+update\s*\(\s*joined_in_beta/i);
    expect(allSql).not.toMatch(/grant\s+insert\s*\(\s*joined_in_beta/i);
  });

  it("is written in a SEPARATE request from the one that unlocks liveness", () => {
    // PostgREST fails the WHOLE request on an unknown column, and code reaches
    // production before the schema here as a matter of course. Folded into the
    // promote write, an unapplied migration would stop verification_status
    // being set for every new member and bounce them between two screens with
    // each blaming the other — HANDOFF.md has that exact failure, 2026-08-29.
    const promote = actions.indexOf('verification_status: "phone_verified"');
    const cohort = actions.indexOf("joined_in_beta: true");
    expect(promote).toBeGreaterThan(-1);
    expect(cohort).toBeGreaterThan(promote);
    // A second `.update(` between them is what makes it a second REQUEST.
    // Without this line the assertion passes on the exact edit it exists to
    // refuse: adding joined_in_beta to the promote object leaves no
    // "joined_in_beta" in the text BETWEEN the two, so the negative match above
    // is satisfied by the bug. Caught by sabotaging it.
    const between = actions.slice(promote, cohort);
    expect(between).toMatch(/\.update\(/);
    expect(between).not.toMatch(/joined_in_beta/);
  });

  it("never fails the signup over it", () => {
    // The account exists and the member is signed in. Refusing them a session
    // because a bookkeeping flag did not land is the worst possible trade, and
    // it is the reasoning acceptBetaInvite is already written with.
    const cohort = actions.slice(actions.indexOf("joined_in_beta: true"));
    expect(cohort).toMatch(/at: "phone\.cohort"/);
    expect(cohort.slice(0, cohort.indexOf('at: "phone.cohort"'))).not.toMatch(/return \{ error/);
  });

  it("marks the account being created, not a member signing in", () => {
    // An existing member who still has an invitation cookie is signing IN.
    const cohort = actions.slice(
      actions.indexOf("joined_in_beta: true"),
      actions.indexOf("joined_in_beta: true") + 400,
    );
    expect(cohort).toMatch(/\.eq\("verification_status", "phone_verified"\)/);
  });

  it("keeps the waitlist free of an account identifier", () => {
    // The reason the design points this way: a user_id on the waitlist would
    // turn the health inference into a health fact.
    expect(allSql).not.toMatch(/alter table public\.waitlist[\s\S]{0,200}add column[^;]*user_id/i);
  });
});

/**
 * The metro centroids exist twice, and a drift here is silent.
 *
 * METROS lives in packages/config and SQL cannot reach it, so
 * 20260912000400 carries its own copy to derive a member's metro from their
 * rounded location. The values were GENERATED from METROS rather than typed,
 * and this is what stops them parting company: a metro added, moved or removed
 * in config with no matching edit there would put members in the wrong place on
 * the admin roster, and nothing else would notice.
 *
 * Same arrangement as privacy-labels and play-data-safety: two copies with a
 * gate, because one copy the database cannot see is not an option.
 */
describe("the SQL metro centroids match METROS", () => {
  const migration = (() => {
    const dir = join(SRC, "..", "..", "..", "supabase", "migrations");
    return readFileSync(join(dir, "20260912000400_which_metro_a_member_is_in.sql"), "utf8");
  })();

  // NUMBERS, not strings. The SQL literal is `-80.0` and the same value read
  // off METROS stringifies to `-80` — a difference in spelling, not in place,
  // and comparing text failed on Pittsburgh for no reason at all.
  const inSql = new Map(
    [...migration.matchAll(/\('([a-z0-9-]+)', (-?[0-9.]+), (-?[0-9.]+)\)/g)].map((m) => [
      m[1]!,
      { lat: Number(m[2]), lng: Number(m[3]) },
    ]),
  );

  /** `elsewhere` has no centroid — it is not a place. */
  const withCentroid = METROS.filter(
    (m): m is typeof m & { lat: number; lng: number } =>
      typeof (m as { lat?: number }).lat === "number",
  );

  it("finds both lists, so the comparison is not vacuous", () => {
    expect(withCentroid.length).toBeGreaterThanOrEqual(40);
    expect(inSql.size).toBe(withCentroid.length);
  });

  it.each(METROS.map((m) => m.id))("%s", (id) => {
    const config = METROS.find((m) => m.id === id) as { lat?: number; lng?: number };
    if (typeof config.lat !== "number") {
      // elsewhere: must NOT be in the SQL list, or every distant member would
      // be slotted into a place that does not exist.
      expect(inSql.has(id)).toBe(false);
      return;
    }
    expect(inSql.get(id), `${id} centroid`).toEqual({ lat: config.lat, lng: config.lng });
  });

  it("never guesses beyond the radius it states", () => {
    // Null, not "elsewhere". A centroid is a city hall rather than a boundary,
    // so past a distance the honest answer is absence — and a roster reading
    // "elsewhere" for somebody 300 miles out looks like a category.
    expect(migration).toMatch(/<= 120701/);
    expect(migration).not.toMatch(/'elsewhere'/);
  });
});

describe("an invitation that ran out can be issued again", () => {
  const lib = code("lib/waitlist.ts");
  const invite = fnBody(lib, "export async function inviteFromWaitlist");

  it("leaves a LIVE invitation alone", () => {
    // The original objection, and it is still right where it applies: a second
    // code overwrites invite_code, so the link somebody is holding goes dead.
    expect(invite.length).toBeGreaterThan(200);
    expect(invite).toMatch(
      /if \(row\.invited_at && !inviteHasExpired\(row\.invited_at\)\) continue/,
    );
  });

  it("never re-invites somebody who already spent their code", () => {
    // betaInviteIsOpen would refuse it, so this would be an email promising a
    // link that cannot work — and the account it would be for already exists.
    expect(invite).toMatch(/if \(row\.accepted_at\) continue/);
  });

  it("does not simply skip anybody who was ever invited", () => {
    // The exact line this replaced. Restoring it strands the holder of an
    // expired code permanently, which is what this whole block is about.
    expect(invite).not.toMatch(/if \(row\.invited_at\) continue/);
  });

  it("claims the row against the value it read, both ways", () => {
    // The optimistic guard has to survive becoming a re-issue: `.is(null)` is
    // only correct for a first issue, and dropping the guard entirely lets two
    // admins mint two codes for one person.
    expect(invite).toMatch(/\.eq\("invited_at", row\.invited_at\)/);
    expect(invite).toMatch(/\.is\("invited_at", null\)/);
  });

  it("asks one function whether a code has expired", () => {
    // Two callers now — the link check and the re-issue — and they must never
    // disagree, or one orphans a live code and the other refuses a dead one.
    expect(fnBody(lib, "export async function betaInviteIsOpen")).toMatch(/inviteHasExpired/);
    expect(fnBody(lib, "function inviteHasExpired")).toMatch(/WAITLIST_INVITE_TTL_DAYS/);
    // And nobody else does the arithmetic themselves.
    const inline = lib.match(/WAITLIST_INVITE_TTL_DAYS \* 24 \* 60 \* 60 \* 1000/g) ?? [];
    expect(inline).toHaveLength(1);
  });
});

describe("a reminder is the same consent step, asked twice", () => {
  const lib = code("lib/waitlist.ts");
  const remind = fnBody(lib, "export async function remindUnconfirmed");

  it("re-sends the ORIGINAL token rather than minting one", () => {
    // A fresh token kills the link in the first email, and the person most
    // likely to still have that email is the one who meant to confirm.
    expect(remind.length).toBeGreaterThan(200);
    expect(remind).toMatch(/sendConfirmation\(row\.email, row\.token, "remind"\)/);
    expect(remind).not.toMatch(/mintToken/);
  });

  it("refuses somebody who confirmed while the page was open", () => {
    expect(remind).toMatch(/if \(row\.confirmed_at\) continue/);
  });

  it("claims the window before sending, not after", () => {
    // One reminder is only one if two callers cannot both pass the check, and
    // the send is the slow part. Stamp, then send.
    const stamp = remind.indexOf("reminded_at: stamped");
    const send = remind.indexOf("sendConfirmation(row.email");
    expect(stamp).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(stamp);
  });

  it("claims the column the decision is made on", () => {
    // Claiming the cooldown instead would let the cron and an admin press pass
    // the same null reminded_at at the same moment and both send — which is the
    // one failure the column exists to prevent.
    expect(remind).toMatch(/\.is\("reminded_at", null\)/);
  });

  it("sends exactly one, ever, rather than one per cooldown", () => {
    // A three-day floor against a thirty-day TTL is nine reminders once a
    // schedule is doing the pressing. The copy promises one.
    expect(remind).toMatch(/if \(remindedAt\.get\(row\.id\)\) continue/);
  });

  it("says something when the read fails for a reason that is NOT the migration", () => {
    // Both branches refuse — no is always the safe answer to "were they already
    // reminded". The difference is audibility: a missing column between a
    // deploy and its migration is expected and quiet, and anything else is a
    // fault that would otherwise look like a feature that stopped working.
    const helper = fnBody(lib, "async function remindedAtByIdOrNull");
    expect(helper).toMatch(/error\.code !== "PGRST204" && error\.code !== "42703"/);
    expect(helper).toMatch(/console\.error/);
    // And it logs the code, never who it asked about.
    expect(helper).not.toMatch(/console\.error[\s\S]{0,120}email/);
  });

  it("refuses to send at all while the column is missing", () => {
    // Code reaches production before the schema here as a matter of course. A
    // reminder sent without reminded_at has no guarantee behind it and could be
    // the ninth, so the safe degradation is to send nobody.
    expect(remind).toMatch(/if \(!remindedAt\) return 0/);
  });

  it("CANNOT extend the life of the row", () => {
    // sweepUnconfirmed deletes on created_at, which nothing here writes — so
    // no amount of reminding buys a row another day. If a reminder ever touched
    // created_at, "one reminder" would decay into an indefinite list.
    expect(remind).not.toMatch(/created_at/);
    const sweep = fnBody(lib, "export async function sweepUnconfirmed");
    expect(sweep).toMatch(/\.lt\("created_at", cutoff\)/);
    expect(sweep).toMatch(/WAITLIST_UNCONFIRMED_TTL_DAYS/);
  });

  it("never invites an unconfirmed address unless told to in as many words", () => {
    // The wall stays in the library. The reminder form having no invite button
    // is not the guarantee; this line is.
    expect(fnBody(lib, "export async function inviteFromWaitlist")).toMatch(
      /if \(!row\.confirmed_at && !options\.includeUnconfirmed\) continue/,
    );
  });

  it("the confirmation email no longer promises silence it cannot keep", () => {
    // It said "nothing will be sent again" — to the person whose address
    // somebody else typed, which is the population double opt-in protects.
    // A reminder breaks that sentence for exactly them.
    const confirm = WAITLIST_EMAIL.confirm.body.join(" ");
    expect(confirm).not.toMatch(/nothing will be sent again/i);
    expect(confirm).toMatch(/one reminder/i);
  });

  it("the reminder says it is the last one", () => {
    expect(WAITLIST_EMAIL.remind.body.join(" ")).toMatch(/last email/i);
  });

  it("the reminder names no condition, subject line included", () => {
    // Its own test rather than a second assertion under the sentence above —
    // sabotaging the subject reported the OTHER claim's name, which reads as
    // that claim being the one holding the line. Two claims, two names.
    //
    // The subject is the half that lands on a lock screen and in a shared
    // inbox, and this email goes to somebody who never confirmed and may not
    // have asked at all.
    const m = WAITLIST_EMAIL.remind;
    expect(`${m.subject} ${m.preview} ${m.body.join(" ")}`).not.toMatch(
      /HSV|HIV|herpes|positive|diagnos|community/i,
    );
  });

  it("leaves room for one reminder inside the life of the row", () => {
    // A floor longer than the TTL is a button that can never be pressed.
    expect(WAITLIST_REMINDER_AFTER_DAYS).toBeGreaterThan(0);
    expect(WAITLIST_REMINDER_AFTER_DAYS).toBeLessThan(WAITLIST_UNCONFIRMED_TTL_DAYS);
  });
});

describe("the unconfirmed are shown, and only one thing is offered", () => {
  const form = code("app/admin/waitlist/remind-form.tsx");
  const page = code("app/admin/waitlist/page.tsx");
  const actions = code("app/admin/waitlist/actions.ts");

  it("cannot call the invite action at all", () => {
    // The claim is about the DOOR, not the word: the first version of this
    // asserted the file never says "invite" and failed on the sentence telling
    // the admin why there is no button. That sentence is the point of the
    // screen; the guard is that the action is not imported.
    expect(form.length).toBeGreaterThan(200);
    const imported = form.match(/import \{([^}]*)\} from "\.\/actions"/)?.[1] ?? "";
    expect(imported).toContain("remind");
    expect(imported).not.toContain("invite");
  });

  it("says on screen that these people cannot be invited", () => {
    // The floor under the test above. A screen listing addresses with one
    // button and no explanation invites somebody to go looking for the other
    // one, or to assume it is missing by accident.
    expect(form).toMatch(/cannot be invited/);
  });

  it("offers no select-all", () => {
    // Unbounded: this is every unconfirmed row there is, not a group somebody
    // named. invite-form.tsx refuses the same control for the same reason.
    expect(form).not.toMatch(/toggleGroup|Select all|selectAll/);
  });

  it("asks the library whether an invitation expired, not the clock", () => {
    // Two reasons, and both matter. The page re-deriving the TTL could disagree
    // with inviteFromWaitlist about who is re-invitable — a button that sends
    // nothing, or somebody hidden who could be reached. And Date.now() is
    // impure, so a server component may not call it during render; the lint
    // rule caught the first version of this page doing exactly that.
    expect(page).toMatch(/r\.invite_expired/);
    expect(page).not.toMatch(/Date\.now\(\)/);
    expect(page).not.toMatch(/Date\.parse/);
  });

  it("decides remindability on the server", () => {
    // A disabled checkbox is not a rule. The floor is re-checked in the action.
    expect(code("lib/waitlist.ts")).toMatch(/remindable/);
    expect(page).toMatch(/remindable: r\.remindable/);
  });

  it("walls the second action too", () => {
    // waitlist has no RLS to fall back on, so every exported action carries its
    // own wall — a second door needs a second lock.
    const body = fnBody(actions, "export async function remind");
    expect(body).toMatch(/await assertAdmin\(\)/);
  });
});

describe("the override is asked for, never assumed", () => {
  const lib = code("lib/waitlist.ts");
  const actions = code("app/admin/waitlist/actions.ts");
  const form = code("app/admin/waitlist/invite-form.tsx");

  it("defaults to refusing", () => {
    // The signature. A flag that defaults to true is not a wall.
    expect(lib).toMatch(/options: \{ readonly includeUnconfirmed\?: boolean \} = \{\}/);
  });

  it("reads the override off the submission, not off the rows", () => {
    // Inferring it from "an unconfirmed id came back" would make the POST its
    // own permission, decided by whoever wrote the request.
    const body = fnBody(actions, "export async function invite");
    expect(body).toMatch(/formData\.get\("allowUnconfirmed"\) === "on"/);
    expect(body).toMatch(/includeUnconfirmed/);
  });

  it("starts the control off", () => {
    expect(form).toMatch(/useState\(false\)/);
    expect(form).toMatch(/name="allowUnconfirmed"/);
  });

  it("clears the selection when the control is turned back off", () => {
    // Otherwise an unconfirmed id stays ticked and off screen, and the count on
    // the button describes people nobody can see.
    expect(form).toMatch(/if \(!on\) setPicked\(new Set\(\)\)/);
  });

  it("says on the row which people are unconfirmed", () => {
    expect(form).toMatch(/not confirmed/);
  });

  it("NEVER writes confirmed_at outside the confirmation endpoint", () => {
    // The one thing the override must not do. confirmed_at records that a
    // person clicked a link; setting it to tidy up a query turns the only
    // record this story rests on into a lie.
    //
    // Scoped, because the first version of this asserted the whole file and
    // failed on `confirmWaitlist` — which writes it, on a click, which is the
    // entire point. A guard that forbids the correct write is not a stricter
    // guard, it is a wrong one.
    // The UPDATE calls, not the word: /confirmed_at:/ across the body matched
    // the InviteCandidate type declaration, which reads the column and writes
    // nothing. A guard aimed at a write has to look at writes.
    for (const fn of ["inviteFromWaitlist", "remindUnconfirmed"]) {
      const body = fnBody(lib, `export async function ${fn}`);
      const updates = body.match(/\.update\(\{[^}]*\}/g) ?? [];
      expect(updates.length).toBeGreaterThan(0);
      for (const u of updates) expect(u).not.toMatch(/confirmed_at/);
    }
    // And the one place that does write it, so this cannot pass by the name
    // changing underneath it.
    expect(fnBody(lib, "export async function confirmWaitlist")).toMatch(
      /confirmed_at: new Date\(\)\.toISOString\(\)/,
    );
  });

  it("does not sweep away an invitation in flight", () => {
    // Follows from the override and would otherwise be quiet data loss: an
    // unconfirmed row that was invited holds the code, and deleting it retires
    // a live invitation and erases that we wrote to that person at all.
    const sweep = fnBody(lib, "export async function sweepUnconfirmed");
    expect(sweep).toMatch(/\.is\("invited_at", null\)/);
  });

  it("does not remind somebody who was invited instead", () => {
    // Two emails in a week from an app they may not have asked about.
    expect(fnBody(lib, "export async function dueForReminder")).toMatch(
      /\.is\("invited_at", null\)/,
    );
  });

  it("counts everybody in the density table, and never hides the confirmed share", () => {
    // This pinned the OPPOSITE until Kevin asked for it, and the earlier
    // reasoning was sound on its own premise: an address nobody has proved is
    // reachable should not move a number that decides where to open. The
    // premise is what changed — once the unconfirmed are being invited, they
    // are people the metro is being opened FOR.
    //
    // What survives is that the honest number stays on the screen. A single
    // total, with no way to see how much of it clicked a link, is the version
    // that would quietly overstate a metro.
    const page = code("app/admin/waitlist/page.tsx");
    expect(page).toMatch(/countByMetro\(rows\)/);
    expect(page).toMatch(/confirmed} confirmed/);
  });

  it("measures reach on the same population as the column beside it", () => {
    // Two adjacent numbers counting different people is worse than either one
    // alone — "4 here, 11 within 250 miles" has to mean one thing.
    const page = code("app/admin/waitlist/page.tsx");
    expect(page).toMatch(
      /peopleIn\.set|peopleIn = new Map\(counts\.map\(\(c\) => \[c\.metro, onList\(c\)\]\)\)/,
    );
    expect(page).not.toMatch(/confirmedIn/);
  });

  it("does not call everybody on the page confirmed", () => {
    // The header said "N confirmed people" and the read underneath it became
    // everybody when the page moved to invitableWaitlist — a sentence that went
    // wrong without anything failing.
    expect(code("app/admin/waitlist/page.tsx")).not.toMatch(/rows\.length} confirmed/);
  });
});

describe("the reminder is scheduled at a local hour", () => {
  const lib = code("lib/waitlist.ts");
  const route = code("app/api/cron/waitlist-reminders/route.ts");
  const due = fnBody(lib, "export async function dueForReminder");

  it("decides the hour per row rather than per run", () => {
    // One schedule covers every zone. A cron fixed in UTC cannot: the same
    // instant is 7pm in New York and 4pm in Los Angeles.
    expect(due.length).toBeGreaterThan(100);
    expect(due).toMatch(
      /localHourIn\(metroTimezone\(row\.metro\), at\) === WAITLIST_REMINDER_HOUR/,
    );
  });

  it("runs every hour, because of that", () => {
    const crons = JSON.parse(readFileSync(join(SRC, "..", "vercel.json"), "utf8")).crons as {
      path: string;
      schedule: string;
    }[];
    const cron = crons.find((c) => c.path === "/api/cron/waitlist-reminders");
    expect(cron).toBeDefined();
    // Minute-of-the-hour, every hour. A daily schedule would serve one zone.
    expect(cron?.schedule).toMatch(/^\d+ \* \* \* \*$/);
  });

  it("walls the route like every other cron", () => {
    expect(route).toMatch(/isAuthorisedCron\(request\)/);
  });

  it("does not catch up after an outage", () => {
    // A row missed at 7pm is still due at 7pm tomorrow, because nothing is
    // stamped by being skipped. Sending everything overdue would deliver at
    // whatever hour the outage ended, which is the one thing this route exists
    // to avoid — so the hour comparison is EXACT, and a catch-up cannot be
    // written without relaxing it.
    //
    // The first version of this asserted the route mentions no identifier named
    // overdue or catchUp. That guard was vacuous and a sabotage proved it: the
    // source is comment-stripped before matching, so a catch-up branch that
    // happened to be named anything else would have sailed through, and the
    // sabotage that should have caught it was itself a comment. This asserts
    // the property instead of the vocabulary.
    expect(due).toMatch(/=== WAITLIST_REMINDER_HOUR/);
    expect(due).not.toMatch(/<=? WAITLIST_REMINDER_HOUR|WAITLIST_REMINDER_HOUR >=?/);
    // And the route asks for now, never for a window.
    expect(route).toMatch(/dueForReminder\(\)/);
  });

  it("reports counts and never who", () => {
    expect(route).toMatch(/due: due\.length/);
    expect(route).not.toMatch(/email/i);
  });

  it("answers nothing-due while the column is missing", () => {
    // The filter names reminded_at, so the request fails outright until the
    // migration lands. Nothing due is the safe answer; the next hour asks again.
    expect(due).toMatch(/if \(error\) return \[\]/);
  });
});

describe("a store address is asked for only where somebody still adds them", () => {
  const fields = code("app/waitlist/tester-fields.tsx");

  it("finds the component at all", () => {
    expect(fields).toMatch(/export function TesterFields/);
  });

  it("reads the config rather than checking for ios", () => {
    // The day the TestFlight link is withdrawn the field has to come back, and
    // the day Android gets one it has to go. A hand-written `platform === "ios"`
    // agrees with the config until somebody changes one of them.
    expect(fields).toMatch(/betaInstallFor\(chosen\)/);
    // Scoped to the DECISION. The first version asserted the file never says
    // `=== "ios"` anywhere and failed on the line narrowing the prop's type,
    // which is not a platform branch at all — it is what makes `chosen` a
    // union rather than a string. No line may decide the account field by
    // naming a platform.
    const deciding = fields.split("\n").filter((l) => /accountLabel|accountHint/.test(l));
    expect(deciding.length).toBeGreaterThan(0);
    for (const line of deciding) expect(line).not.toMatch(/"ios"|"android"/);
  });

  it("reacts to what they just picked, not what they saved", () => {
    // The platform is a radio in the same form. Without state the field is
    // decided once, from the prop, and never appears or disappears as somebody
    // changes their mind.
    expect(fields).toMatch(/useState<"ios" \| "android" \| null>\(initial\)/);
    expect(fields).toMatch(/onChange=\{\(\) => setChosen\(id\)\}/);
  });

  it("holds no Apple ID while the public link enrols the tester", () => {
    // WAITLIST_NEVER refuses an identifier collected for nothing, and a field
    // that USED to be justified gets no exemption from it.
    if (BETA_LINKS.ios.publicLink) {
      expect(betaInstallFor("ios").accountLabel).toBeNull();
    }
    // Android still needs one — somebody pastes it onto the closed-testing list.
    expect(betaInstallFor("android").accountLabel).toMatch(/google/i);
  });
});
