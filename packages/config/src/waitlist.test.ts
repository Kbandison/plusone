import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BANNED_COPY_TERMS } from "./brand";
import { DRAFT_COPY } from "./draft-copy";
import {
  BETA_INSTALL,
  BETA_LINKS,
  BETA_MANUAL_STEP,
  LINK_ADDS_THE_TESTER,
  betaInstallFor,
  PLAY_TRACK,
  METROS,
  METRO_IDS,
  WAITLIST_EMAIL,
  WAITLIST_INVITE_TTL_DAYS,
  WAITLIST_NEVER,
  WAITLIST_UNCONFIRMED_TTL_DAYS,
  isMetro,
  metroLabel,
} from "./waitlist";

const MIGRATIONS = new URL("../../../supabase/migrations/", import.meta.url);
const MIGRATION_DIR = fileURLToPath(MIGRATIONS);

/** Every migration that touches the waitlist table, concatenated. */
function waitlistSql(): string {
  const files = readdirSync(MIGRATION_DIR).filter((f) => f.endsWith(".sql"));
  return files
    .map((f) => readFileSync(fileURLToPath(new URL(f, MIGRATIONS)), "utf8"))
    .filter((sql) => /\bpublic\.waitlist\b/.test(sql))
    .join("\n");
}

/**
 * Comments stripped before matching.
 *
 * Not optional here and it is the specific failure this file exists to avoid: a
 * grant assertion elsewhere in this repo was satisfied by the migration's own
 * COMMENT saying the right sentence, and passed for days while asserting
 * nothing. WAITLIST_NEVER is a list of words, and every one of them appears in
 * prose in the migration header explaining why it is banned — so an unstripped
 * scan would match its own documentation and fail on a schema that is correct.
 */
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
}

describe("the waitlist holds two things and refuses the rest", () => {
  const sql = stripComments(waitlistSql());

  it("finds the migration at all", () => {
    // A silent zero makes every assertion below vacuous — the exact shape that
    // let a labels scan read no columns and pass.
    expect(sql).toMatch(/create table if not exists public\.waitlist/);
    expect(sql.length).toBeGreaterThan(500);
  });

  /** The columns the table actually declares, read out of the DDL. */
  const declared = (() => {
    const body =
      /create table if not exists public\.waitlist \(([\s\S]*?)\n\);/.exec(sql)?.[1] ?? "";
    const fromCreate = [...body.matchAll(/^\s{2}(\w+)\s+[a-z]/gm)].map((m) => m[1] as string);
    const fromAlter = [
      ...sql.matchAll(/alter table public\.waitlist\s+add column if not exists (\w+)/g),
    ].map((m) => m[1] as string);
    return [...fromCreate, ...fromAlter];
  })();

  it("reads a plausible number of columns", () => {
    // The floor. Without it, a regex that stopped matching would leave the
    // WAITLIST_NEVER assertion below trivially satisfied by an empty list.
    expect(declared.length).toBeGreaterThan(8);
    expect(declared).toContain("email");
    expect(declared).toContain("metro");
    expect(declared).toContain("confirm_sent_at");
  });

  it("declares no column WAITLIST_NEVER forbids", () => {
    const forbidden = declared.filter((c) => WAITLIST_NEVER.includes(c));
    expect(
      forbidden,
      "a column on the waitlist that WAITLIST_NEVER refuses — read the argument beside it in waitlist.ts before removing it from that list",
    ).toEqual([]);
  });

  it("names the condition nowhere in the schema", () => {
    // The one that would matter most, asserted against the whole file rather
    // than the column list: a CHECK, an index or a default mentioning it would
    // be just as bad as a column.
    for (const term of ["condition", "u_equals_u", "community"]) {
      expect(sql, `${term} must not appear in the waitlist schema`).not.toMatch(
        new RegExp(`\\b${term}\\b`),
      );
    }
  });

  it("is granted to nobody", () => {
    expect(sql).toMatch(/revoke all on public\.waitlist from anon, authenticated/);
    // The point of the table. A grant here means PostgREST can reach it, and
    // the confirmation token is in it.
    expect(sql).not.toMatch(/grant \w+ on public\.waitlist to/);
  });

  it("has RLS on and forced", () => {
    expect(sql).toMatch(/alter table public\.waitlist enable row level security/);
    expect(sql).toMatch(/alter table public\.waitlist force row level security/);
  });

  it("creates no policy, which is what makes the grant the whole wall", () => {
    expect(sql).not.toMatch(/create policy[\s\S]{0,80}on public\.waitlist/);
  });
});

describe("the metro list", () => {
  it("has unique ids matching the column's shape constraint", () => {
    expect(new Set(METRO_IDS).size).toBe(METROS.length);
    for (const { id } of METROS) {
      // The same pattern the CHECK uses. A metro the database would refuse is
      // an option that fails at the end of a form somebody already filled in —
      // the failure draft-copy.test.ts describes for conditions.
      expect(id, `${id} would be refused by waitlist_metro_shape`).toMatch(
        /^[a-z][a-z0-9-]{1,30}$/,
      );
    }
  });

  it("labels every id and refuses one it does not know", () => {
    for (const { id, label } of METROS) expect(metroLabel(id)).toBe(label);
    expect(metroLabel("nowhere")).toBeNull();
    expect(isMetro("nowhere")).toBe(false);
    expect(isMetro("atlanta")).toBe(true);
  });

  it("keeps a way out for somebody the list does not cover", () => {
    // Without it the form cannot be completed by anyone outside the list, and
    // the count on `elsewhere` is the signal that the list is too short.
    expect(METRO_IDS).toContain("elsewhere");
    expect(METROS[METROS.length - 1]?.id).toBe("elsewhere");
  });

  it("is alphabetical by label, apart from that one", () => {
    // Ordering by expected density would rank American cities by diagnosis
    // rate on a public page. The reasoning is in waitlist.ts; this holds it.
    const labels = METROS.slice(0, -1).map((m) => m.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });
});

describe("no email we send outs the person receiving it", () => {
  const CONDITION_WORDS = [
    "hsv",
    "hiv",
    "herpes",
    "positive",
    "diagnosis",
    "std",
    "sti",
    "status",
    "u=u",
  ];

  /**
   * A subject line is read by more people than the email is.
   *
   * It arrives on a lock screen, on a shared phone, over a shoulder. A subject
   * naming a condition is a disclosure the recipient never made, delivered to
   * whoever happened to be looking — and it cannot be taken back.
   *
   * The PREVIEW is held to the same rule for the same reason: mail clients show
   * it beside the subject in the list, before anything is opened.
   */
  for (const [name, email] of Object.entries(WAITLIST_EMAIL)) {
    it(`${name}: the subject names no condition`, () => {
      const subject = email.subject.toLowerCase();
      for (const word of CONDITION_WORDS) {
        expect(subject, `"${email.subject}" names ${word}`).not.toContain(word);
      }
      expect(email.subject.length).toBeGreaterThan(0);
      expect(email.subject.length).toBeLessThanOrEqual(78);
    });

    it(`${name}: the preview line names no condition either`, () => {
      const preview = email.preview.toLowerCase();
      for (const word of CONDITION_WORDS) {
        expect(preview, `the preview names ${word}`).not.toContain(word);
      }
    });

    it(`${name}: uses none of the banned copy terms anywhere`, () => {
      const all = [email.subject, email.preview, ...email.body].join(" ").toLowerCase();
      for (const term of BANNED_COPY_TERMS) {
        expect(all, `uses "${term}"`).not.toContain(term.toLowerCase());
      }
    });
  }

  it("the confirmation says what to do if it was not you", () => {
    // The whole reason confirmation exists: somebody else can type your
    // address. If the mail does not say that plainly, it reads as a service
    // you signed up for and forgot.
    expect(WAITLIST_EMAIL.confirm.body.join(" ")).toMatch(/not you/i);
  });
});

describe("the closed-beta copy does not strand a member", () => {
  const B = DRAFT_COPY.betaClosed;

  it("offers sign-in as well as the list", () => {
    // The half that is easy to leave out. Somebody who already has an account
    // and typed their number on the wrong screen does not need an invitation,
    // and telling them they do is a dead end with their own data behind it.
    expect(B.already.length).toBeGreaterThan(0);
    expect(B.signIn.length).toBeGreaterThan(0);
    expect(B.join.length).toBeGreaterThan(0);
  });

  it("reads as a shut door rather than a broken one", () => {
    const all = `${B.heading} ${B.body}`.toLowerCase();
    for (const word of ["error", "wrong", "failed", "invalid"]) {
      expect(all, `"${word}" blames somebody who did nothing`).not.toContain(word);
    }
  });
});

describe("the waitlist page says what it keeps, before the button", () => {
  const C = DRAFT_COPY.waitlist;

  it("names both stored fields in the disclosure", () => {
    expect(C.holds.toLowerCase()).toContain("email");
    expect(C.holds.toLowerCase()).toMatch(/area|metro/);
  });

  it("promises not to ask the thing WAITLIST_NEVER refuses", () => {
    // The sentence and the schema are one claim. If the copy stops saying it,
    // the schema constraint has lost its public half.
    expect(C.holds).toMatch(/never/i);
  });

  it("gives the same answer whether or not the address was already there", () => {
    // One success string, so no render can branch on membership. The oracle
    // rule from lib/waitlist.ts, held at the copy layer.
    expect(C.sent.length).toBeGreaterThan(0);
    expect(Object.keys(C)).not.toContain("alreadyOnList");
  });
});

describe("the two lifetimes", () => {
  it("an invitation expires sooner than an unconfirmed address is swept", () => {
    // Not arbitrary: an invitation that outlived the row it points at would be
    // a live link to a deleted person.
    expect(WAITLIST_INVITE_TTL_DAYS).toBeLessThan(WAITLIST_UNCONFIRMED_TTL_DAYS);
  });
});

describe("a person can tell which of the two things they signed up for", () => {
  const C = DRAFT_COPY.waitlistConfirm;

  it("says something different to a tester", () => {
    // The defect this replaced: one sentence for everybody, so somebody who
    // ticked the testing box got no acknowledgement the tick had registered.
    expect(C.betaHeading).not.toBe(C.heading);
    expect(C.betaBody).not.toBe(C.body);
  });

  it("tells the tester the tick landed, in words", () => {
    expect(C.betaNote.toLowerCase()).toMatch(/ticked|early build/);
  });

  it("offers a way to change the answer from the confirmation itself", () => {
    // Without this the decision is final at the moment of a checkbox nobody
    // read carefully, and joinWaitlist refuses to act on a confirmed address.
    expect(C.manage.length).toBeGreaterThan(0);
  });
});

describe("a tester is told how to get the app", () => {
  it("covers all three platforms, browser included", () => {
    expect(Object.keys(BETA_INSTALL).sort()).toEqual(["android", "browser", "ios"]);
  });

  for (const [id, install] of Object.entries(BETA_INSTALL)) {
    it(`${id}: has real steps rather than a promise`, () => {
      expect(install.steps.length).toBeGreaterThanOrEqual(2);
      for (const step of install.steps) expect(step.length).toBeGreaterThan(20);
    });
  }

  it("asks for the store account on the two platforms that need one", () => {
    expect(BETA_INSTALL.android.accountLabel).toMatch(/google/i);
    expect(BETA_INSTALL.ios.accountLabel).toMatch(/apple/i);
    // The browser needs no account from anybody — asking would be collecting
    // an identifier for nothing.
    expect(BETA_INSTALL.browser.accountLabel).toBeNull();
  });

  it("warns that the store account is probably not the address they gave us", () => {
    // The single most common reason a tester never finds the build, and it
    // fails silently — the store just says the app is unavailable.
    for (const id of ["android", "ios"] as const) {
      expect(BETA_INSTALL[id].accountHint ?? "").toMatch(/signed in|that address|not the address/i);
    }
  });

  it("promises Apple no timeline", () => {
    // Beta App Review is a queue we do not control. A date we miss is worse
    // than no date.
    const wait = BETA_INSTALL.ios.wait ?? "";
    expect(wait).not.toMatch(/\b\d+\s*(hours?|days?|weeks?)\b/);
    expect(wait).toMatch(/cannot predict|review/i);
  });

  it("tells an iPhone user the one thing that decides whether push works", () => {
    // iOS grants web push only to a page added to the home screen. For a
    // tester that is the difference between reporting a bug and never seeing
    // the feature.
    expect(BETA_INSTALL.browser.wait ?? "").toMatch(/home screen/i);
  });

  it("puts being added BEFORE the links, because that is a dependency", () => {
    // An unlisted person opening either link is told the programme is not
    // available or the app cannot be found — both read as a dead URL we sent.
    const steps = BETA_INSTALL.android.steps;
    const listedAt = steps.findIndex((x) => /tell us your google account/i.test(x));
    const linkAt = steps.findIndex((x) => /tester link/i.test(x));
    expect(listedAt).toBeGreaterThan(-1);
    expect(linkAt).toBeGreaterThan(listedAt);
    expect(BETA_INSTALL.android.wait ?? "").toMatch(/not a dead link/i);
  });

  it("does not tell an Android tester to wait for an email from Google", () => {
    // The correction: a tester needs the OPT-IN LINK, and waiting for Google to
    // send it is how somebody sits quietly for three days assuming they were
    // forgotten. We send it, so the steps name it.
    const steps = BETA_INSTALL.android.steps.join(" ").toLowerCase();
    expect(steps).toMatch(/tester link|opt-in|link/);
    expect(steps).not.toMatch(/you get an email from google/);
  });

  it("does not imply a TestFlight tester needs neither an invite nor a link", () => {
    // TestFlight admits people by invitation or by public link and by no third
    // way. A null BETA_OPT_IN_URL.ios means "we use invitations", not "nothing
    // is needed".
    const steps = BETA_INSTALL.ios.steps.join(" ").toLowerCase();
    expect(steps).toMatch(/invitation|link/);
  });

  it("the opt-in link matches the track it claims to be on", () => {
    // The two shapes are different and the wrong one silently does nothing
    // useful. Closed is /apps/testing/<package>; internal is
    // /apps/internaltest/<id>. Reading the track off the artifact rather than
    // trusting the constant beside it.
    expect(PLAY_TRACK).toBe("closed");
    expect(BETA_LINKS.android.optIn).toContain("/apps/testing/");
    expect(BETA_LINKS.android.optIn).not.toContain("/apps/internaltest/");
  });

  it("keeps the opt-in and the store link apart", () => {
    // Both are play.google.com and they do different jobs: one makes you a
    // tester, the other is where you install. Sending the store link first is
    // a dead end that looks like our mistake.
    expect(BETA_LINKS.android.store).toContain("/store/apps/details");
    expect(BETA_LINKS.android.optIn).not.toBe(BETA_LINKS.android.store);
    // Same app, both of them.
    for (const url of Object.values(BETA_LINKS.android)) {
      expect(url).toContain("app.loveplusone");
      expect(url.startsWith("https://play.google.com/")).toBe(true);
    }
  });

  it("invents no TestFlight link", () => {
    // Null is a real answer — it means individual invitations — and a
    // plausible wrong URL sends a tester to somebody else's app.
    const link = BETA_LINKS.ios.publicLink;
    expect(link === null || /^https:\/\/testflight\.apple\.com\//.test(link)).toBe(true);
  });

  it("says where a human still has to act, and does not claim iOS is automatic", () => {
    // The asymmetry is the point: Android opt-in is self-serve, TestFlight
    // invitations are added by hand until a public link exists.
    expect(BETA_MANUAL_STEP.android.toLowerCase()).toMatch(/themselves|self/);
    expect(BETA_MANUAL_STEP.ios.toLowerCase()).toMatch(/one at a time|by hand|individual/);
  });
});

describe("somebody already on the list can still change their mind", () => {
  const C = DRAFT_COPY.waitlistManage;

  it("offers both the area and the testing answer", () => {
    expect(C.areaLabel.length).toBeGreaterThan(0);
    expect(C.betaLabel.length).toBeGreaterThan(0);
  });

  it("does not pretend unticking cancels an invitation already sent", () => {
    expect(C.invitedNote.toLowerCase()).toMatch(/will not cancel|already/);
  });

  it("keeps leaving available but does not lead with it", () => {
    // The page exists because the exit used to be the only door: joinWaitlist
    // refuses a confirmed address, so somebody who wanted to move city or
    // start testing could do neither.
    expect(C.leaveHeading.toLowerCase()).toMatch(/^or /);
  });
});

describe("which link actually puts somebody on a tester list", () => {
  /**
   * The question that produced this block, asked outright: "do either link add
   * their email or account to the respective beta lists?" The answer is not
   * symmetric, and the asymmetry decides how much manual work exists.
   */
  it("a Play opt-in link is acceptance, not joining", () => {
    // An address not already on the closed-testing list is told the programme
    // is unavailable. Somebody still has to add them.
    expect(LINK_ADDS_THE_TESTER.playOptIn).toBe(false);
    expect(LINK_ADDS_THE_TESTER.playStore).toBe(false);
  });

  it("a TestFlight public link is the only self-serve door of the four", () => {
    expect(LINK_ADDS_THE_TESTER.testFlightInvite).toBe(false);
    expect(LINK_ADDS_THE_TESTER.testFlightPublicLink).toBe(true);
  });

  it("the Android steps do not claim the link enrols anybody", () => {
    const android = betaInstallFor("android");
    // Being added comes first and the copy says nothing before it works.
    expect(android.steps[0]?.toLowerCase()).toMatch(/we add it|tester list/);
    expect(android.accountLabel).toMatch(/google/i);
  });
});

describe("a TestFlight public link changes what we may ask for", () => {
  /**
   * The defect this pins. `BETA_INSTALL.ios` asks for an Apple ID
   * unconditionally — correct on the invitation route, where we type that
   * address into App Store Connect ourselves. On the public-link route NOBODY
   * adds them, we never open App Store Connect for that person, and their Apple
   * ID becomes an identifier we have no use for.
   *
   * Collecting one for nothing is the exact thing WAITLIST_NEVER exists to
   * refuse, and a field that USED to be justified gets no exemption from it.
   */
  it("asks for an Apple ID only while we are the ones adding them", () => {
    const ios = betaInstallFor("ios");
    const usingPublicLink = BETA_LINKS.ios.publicLink !== null;

    if (usingPublicLink) {
      expect(
        ios.accountLabel,
        "a public link enrols the tester, so their Apple ID is an identifier collected for nothing",
      ).toBeNull();
      expect(ios.steps.join(" ").toLowerCase()).toMatch(/start testing/);
    } else {
      expect(ios.accountLabel).toMatch(/apple/i);
      expect(ios.steps.join(" ").toLowerCase()).toMatch(/we add your apple id/);
    }
  });

  it("resolves from the link rather than from a second constant", () => {
    // Two facts that agree until they do not. The resolver reads BETA_LINKS, so
    // turning the link on changes the copy without anybody remembering to.
    const ios = betaInstallFor("ios");
    expect(ios.id).toBe("ios");
    expect(betaInstallFor("android").id).toBe("android");
    expect(betaInstallFor("browser").accountLabel).toBeNull();
  });
});

describe("the store account is asked for once, at signup", () => {
  /**
   * The round trip this removed, reported by Kevin 2026-09-01: the store
   * account was asked for on `/beta/<code>`, AFTER an invitation, so nobody
   * could be added to a Play or TestFlight list until they came back and filled
   * in a second form. Every invitation became a wait that might never end.
   *
   * The privacy property it was protecting is kept by making the fields
   * conditional rather than by deferring them — somebody who does not tick the
   * testing box is asked nothing and has no store identity stored.
   */
  const C = DRAFT_COPY.waitlist;

  it("asks which phone and which store account", () => {
    expect(C.platformLabel.length).toBeGreaterThan(0);
    expect(C.storeEmailLabel.length).toBeGreaterThan(0);
  });

  it("warns that it is probably not the address they just gave", () => {
    // The single most common reason a tester never finds the build, and it
    // fails silently — the store just says the app is unavailable.
    const hint = C.storeEmailHint.toLowerCase();
    expect(hint).toMatch(/google/);
    expect(hint).toMatch(/apple/);
    expect(hint).toMatch(/not the address|often not/);
  });

  it("says the browser is still an option, so the question is not a barrier", () => {
    // Somebody who does not want to install anything should not feel pushed
    // into naming a store account to be useful.
    expect(C.platformHint.toLowerCase()).toMatch(/browser/);
  });

  it("has an error for each thing that can be missing", () => {
    expect(C.errors.platformRequired.length).toBeGreaterThan(0);
    expect(C.errors.storeEmailRequired.length).toBeGreaterThan(0);
    expect(C.errors.storeEmailInvalid.length).toBeGreaterThan(0);
  });
});
