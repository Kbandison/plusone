import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

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
    const allowed = new Set(["app/beta/[code]/page.tsx"]);
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
    const invite = /export async function inviteFromWaitlist[\s\S]*?\n}/.exec(lib)?.[0] ?? "";
    expect(invite.length).toBeGreaterThan(200);
    expect(invite).toMatch(/if \(!row\.confirmed_at\) continue/);
  });

  it("spends an invitation atomically", () => {
    const accept = /export async function acceptBetaInvite[\s\S]*?\n}/.exec(lib)?.[0] ?? "";
    // Two devices racing the same link must produce one account.
    expect(accept).toMatch(/\.is\("accepted_at", null\)/);
  });

  it("deletes on leaving rather than flagging", () => {
    const leave = /export async function leaveWaitlist[\s\S]*?\n}/.exec(lib)?.[0] ?? "";
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
    const helper = /function storeFields[\s\S]*?\n}/.exec(lib)?.[0] ?? "";
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
    const fn = /export function testerList[\s\S]*?\n}/.exec(lib)?.[0] ?? "";
    expect(fn).toMatch(/r\.invited_at/);
    expect(fn).not.toMatch(/r\.accepted_at/);
  });

  it("still refuses to list anybody uninvited", () => {
    // Adding somebody to a Play track before they have an invitation lets them
    // install an app they cannot sign into.
    const fn = /export function testerList[\s\S]*?\n}/.exec(lib)?.[0] ?? "";
    expect(fn).toMatch(/wants_beta/);
  });
});
