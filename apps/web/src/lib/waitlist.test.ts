import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BETA_INSTALL } from "@plusone/config";

const SRC = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

/** Comments stripped, so a guard cannot be satisfied by prose describing it. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

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

  it("/onboarding/phone gates it on the invitation, checked against the database", () => {
    const actions = code("app/onboarding/phone/actions.ts");
    expect(actions).toMatch(/betaInviteIsOpen/);
    expect(actions).toMatch(/shouldCreateUser:\s*invited/);
    // The cookie is read here and not trusted as a credential: the value goes
    // to a function that asks the database. If this ever becomes
    // `shouldCreateUser: Boolean(cookie)` the gate is a cookie anybody can set.
    expect(actions).not.toMatch(/shouldCreateUser:\s*Boolean\(/);
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
  it("no public page links to /onboarding/phone", () => {
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
    const allowed = new Set(["app/beta/[code]/page.tsx", "app/beta/[code]/install.tsx"]);
    const offenders = files.filter(
      (f) =>
        !allowed.has(f.replace(/^app\//, "app/")) && /href="\/onboarding\/phone"/.test(code(f)),
    );
    expect(
      offenders,
      "links to signup, which the beta gate refuses for anybody without an invitation",
    ).toEqual([]);
  });

  it("the front page and the marketing header point at the waitlist", () => {
    expect(code("app/page.tsx")).toMatch(/href="\/waitlist"/);
    expect(code("app/site-header.tsx")).toMatch(/href="\/waitlist"/);
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

  it("never invites an unconfirmed address", () => {
    const invite = fnBody(lib, "export async function inviteFromWaitlist");
    expect(invite.length).toBeGreaterThan(200);
    expect(invite).toMatch(/if \(!row\.confirmed_at\) continue/);
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

  it("the tester list keys on invited, not accepted", () => {
    // The point of asking at signup. Keyed on accepted, a tester could only be
    // added to a store list after following their invitation and filling in a
    // second form — which is the round trip being removed.
    const fn = fnBody(lib, "export function testerList");
    expect(fn).toMatch(/r\.invited_at/);
    expect(fn).not.toMatch(/r\.accepted_at/);
  });

  it("still refuses to list anybody uninvited", () => {
    // Adding somebody to a Play track before they have an invitation lets them
    // install an app they cannot sign into.
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

  it("does not claim /beta/*, so an invitation link opens Safari", () => {
    // Not a defect to fix here — claiming it is a real option, and it needs no
    // iOS build because the entitlement is domain-level
    // (`applinks:www.loveplusone.app`) and the components are served from here.
    //
    // It is pinned because the iOS COPY below is written for this being false.
    // Whoever adds `/beta/*` gets this failure and, with it, the reason to go
    // and shorten those steps.
    expect(components).not.toMatch(/\/beta/);
  });

  it("tells an iOS tester to make the account before installing", () => {
    // The cookie proxy.ts sets lands in Safari's jar. The installed app is
    // WKWebView with its own, so the gate in /onboarding/phone finds nothing
    // and refuses somebody who is genuinely invited. An ACCOUNT crosses that
    // boundary where a cookie does not, because signing in needs no invitation.
    for (const steps of [ios.steps, ios.pendingSteps]) {
      expect(steps[0]).toMatch(/browser/i);
      expect(steps[0]).toMatch(/account/i);
      // Before the install instructions, not buried under them.
      expect(steps.slice(1).join(" ")).toMatch(/TestFlight/);
    }
  });

  it("does not tell an Android tester the same thing, because a TWA shares Chrome's jar", () => {
    // The mirror, and the reason this suite is not vacuous: if the assertion
    // above passed for both platforms it would be matching something generic
    // rather than the instruction that was added for one engine.
    expect(android.steps[0]).not.toMatch(/browser/i);
  });
});
