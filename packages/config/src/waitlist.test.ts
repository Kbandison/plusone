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
  metrosWithin,
  WAITLIST_EMAIL,
  WAITLIST_INVITE_TTL_DAYS,
  WAITLIST_NEVER,
  WAITLIST_CRON_MINUTE,
  WAITLIST_NUDGE_AFTER_DAYS,
  WAITLIST_NUDGE_LAST_HOURS,
  WAITLIST_NUDGE_WEEK_LEFT_DAYS,
  INVITE_NUDGE_EMAIL,
  inviteExpiresAt,
  inviteNudgeDeadline,
  inviteNudgeDaysLeft,
  inviteNudgeBody,
  inviteNudgeExpiry,
  inviteNudgeSchedule,
  eveningNearest,
  inviteNudgeDue,
  inviteNudgeSent,
  nextInviteNudge,
  WAITLIST_UNCONFIRMED_TTL_DAYS,
  WAITLIST_REMINDER_AFTER_DAYS,
  WAITLIST_REMINDER_HOUR,
  WAITLIST_REMINDER_TZ,
  isMetro,
  localHourIn,
  metroLabel,
  metroTimezone,
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
  /**
   * Two lists, because two of these are three letters long and live inside
   * ordinary English.
   *
   * SUBSTRING is the stricter test and stays the default: it is what catches
   * "seropositive", which a word-boundary match would let through, and nothing
   * innocent contains "hsv" or "herpes".
   *
   * "sti" and "std" cannot be tested that way. "sti" is inside STILL, stick,
   * distinct, destination; on 2026-09-23 it failed the subject "Your Plus One
   * invitation is still open", which names no condition at all. A guard that
   * cries wolf on plain English gets worked around, and the workaround is
   * always to reword the innocent copy — so the rule is worth narrowing rather
   * than the sentence.
   *
   * Word boundaries still catch every real use: "STI", "an STI", "STI status",
   * "STD/STI", "HIV-positive". Checked by sabotage below.
   */
  const CONDITION_SUBSTRINGS = ["hsv", "hiv", "herpes", "positive", "diagnosis", "status", "u=u"];
  const CONDITION_WORDS = ["sti", "std"];

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
      for (const word of CONDITION_SUBSTRINGS) {
        expect(subject, `"${email.subject}" names ${word}`).not.toContain(word);
      }
      for (const word of CONDITION_WORDS) {
        expect(subject, `"${email.subject}" names ${word}`).not.toMatch(
          new RegExp(`\\b${word}\\b`),
        );
      }
      expect(email.subject.length).toBeGreaterThan(0);
      expect(email.subject.length).toBeLessThanOrEqual(78);
    });

    it(`${name}: the preview line names no condition either`, () => {
      const preview = email.preview.toLowerCase();
      for (const word of CONDITION_SUBSTRINGS) {
        expect(preview, `the preview names ${word}`).not.toContain(word);
      }
      for (const word of CONDITION_WORDS) {
        expect(preview, `the preview names ${word}`).not.toMatch(new RegExp(`\\b${word}\\b`));
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

/**
 * The closed-beta copy is gone, and the half that mattered is not.
 *
 * `betaClosed` held a refusal card — heading, body, "Join the list" — and two
 * lines that were never about the beta at all: "Already have an account?" and
 * "Sign in". That pair is the half easy to leave out and the one that strands
 * somebody real, a member who typed their number on the wrong screen and does
 * not need an invitation.
 *
 * Signup opened on 2026-09-13 and the card went with the gate. The pair moved
 * to `phone`, where it renders, because a member on the wrong screen happens
 * whether or not there is a gate.
 */
describe("the wrong-screen member is still offered a way through", () => {
  it("keeps the sign-in offer on the phone screen", () => {
    expect(DRAFT_COPY.phone.already.length).toBeGreaterThan(0);
    expect(DRAFT_COPY.phone.signIn.length).toBeGreaterThan(0);
  });

  it("leaves no copy describing a beta that has ended", () => {
    // The same class of error as a reviewer note describing a gate that is no
    // longer there — BACKLOG 22 names it explicitly.
    expect(DRAFT_COPY).not.toHaveProperty("betaClosed");
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
    it(`${id}: has real steps rather than a promise, in both sets`, () => {
      for (const set of [install.steps, install.pendingSteps]) {
        expect(set.length).toBeGreaterThanOrEqual(2);
        // On the joined text, not per step. "Tap Become a tester." is a real
        // instruction and twenty characters, and the per-step floor was
        // failing it for being short rather than for being vague.
        expect(set.join(" ").length).toBeGreaterThan(120);
        for (const step of set) expect(step.length).toBeGreaterThan(10);
      }
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

  it("puts being added BEFORE the links, for anybody not yet on the list", () => {
    // An unlisted person opening either link is told the programme is not
    // available or the app cannot be found — both read as a dead URL we sent.
    // This is the PENDING set: somebody who supplied their account here rather
    // than at signup, so nobody has added them yet.
    const steps = BETA_INSTALL.android.pendingSteps;
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

  it("says where a human still has to act, and tracks whether iOS still needs one", () => {
    // The asymmetry was the point and it has moved. Android is still
    // per-person: somebody pastes a Google account onto the closed-testing
    // list, and the tester opts in themselves. iOS was per-person too, until a
    // public link existed — and this assertion asserted that state rather than
    // the rule, so it failed the moment the link was set. Which is correct: the
    // sentence it guards had become false and had to be rewritten with it.
    expect(BETA_MANUAL_STEP.android.toLowerCase()).toMatch(/themselves|self/);

    const ios = BETA_MANUAL_STEP.ios.toLowerCase();
    if (BETA_LINKS.ios.publicLink) {
      // Nothing to do, and it must SAY nothing rather than describing work that
      // no longer exists — an admin reading "add their Apple ID by hand" would
      // go and do it.
      expect(ios).not.toMatch(/one at a time|by hand|individual/);
      expect(ios).toMatch(/nothing|enrol/);
    } else {
      expect(ios).toMatch(/one at a time|by hand|individual/);
    }
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
    // Being added comes first in the pending set, and the copy says nothing
    // before it works.
    expect(android.pendingSteps[0]?.toLowerCase()).toMatch(/we add it|tester list/);
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
      // In the PENDING set — the one shown to somebody we are still waiting on
      // an Apple ID from. Matched on the intent rather than one phrasing: the
      // step reads "Tell us your Apple ID below, and we add it to the test
      // group", and pinning the exact words made this fail on a rewrite that
      // said the same thing.
      const pending = ios.pendingSteps.join(" ").toLowerCase();
      expect(pending).toMatch(/apple id/);
      expect(pending).toMatch(/we add/);
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

  it("asks which phone, and a store account only where one is still needed", () => {
    expect(C.platformLabel.length).toBeGreaterThan(0);

    // The label and hint were generic strings on DRAFT_COPY and are now read
    // per platform, because the answer stopped being the same for both: a
    // TestFlight public link enrols the tester, so from 2026-09-17 an iPhone
    // tester is asked for nothing. Holding an Apple ID nobody will use is the
    // exact thing WAITLIST_NEVER refuses.
    for (const platform of ["android", "ios"] as const) {
      const install = betaInstallFor(platform);
      const enrolsItself = platform === "ios" && BETA_LINKS.ios.publicLink !== null;
      if (enrolsItself) {
        expect(install.accountLabel, platform).toBeNull();
        expect(install.accountHint, platform).toBeNull();
      } else {
        expect(install.accountLabel?.length ?? 0, platform).toBeGreaterThan(0);
      }
    }
  });

  it("warns that it is probably not the address they just gave", () => {
    // The single most common reason a tester never finds the build, and it
    // fails silently — the store just says the app is unavailable. Asserted on
    // whichever platforms still ask, rather than on one sentence naming both:
    // the generic hint said "Your Google account on Android, or your Apple ID
    // on iPhone" and went FALSE the day iOS stopped being asked.
    const asking = (["android", "ios"] as const)
      .map(betaInstallFor)
      .filter((i) => i.accountHint !== null);
    expect(asking.length).toBeGreaterThan(0);
    for (const install of asking) {
      const hint = install.accountHint!.toLowerCase();
      expect(hint, install.id).toMatch(/signed in on the phone|signed in on the device/);
      expect(hint, install.id).toMatch(/not the address|often not/);
    }
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

describe("the normal steps do not describe work that is already done", () => {
  /**
   * The rule this file already stated and the steps then broke: every step is
   * what the PERSON does, not what we do.
   *
   * A store account is collected at signup, so an invitation is only sent once
   * it exists — and whoever sends it adds them to the track in the same
   * sitting. By the time the invitation is opened, being added has happened.
   * Step two saying "we add your Apple ID" describes a finished action in the
   * future tense and reads as a delay that is not there.
   */
  for (const id of ["android", "ios"] as const) {
    it(`${id}: the settled steps promise nothing on our part`, () => {
      const settled = BETA_INSTALL[id].steps.join(" ").toLowerCase();
      for (const phrase of ["we add", "we will add", "tell us your"]) {
        expect(settled, `"${phrase}" describes something already done`).not.toContain(phrase);
      }
    });

    it(`${id}: says plainly that they are already on the list`, () => {
      // The difference between the two sets has to be visible to the reader,
      // not only to the code choosing between them.
      const wait = (BETA_INSTALL[id].wait ?? "").toLowerCase();
      expect(wait).toMatch(/already/);
    });

    it(`${id}: the pending set is the one that says we still have to act`, () => {
      const pending = BETA_INSTALL[id].pendingSteps.join(" ").toLowerCase();
      expect(pending).toMatch(/we add|tell us your/);
    });
  }
});

describe("metro coordinates are data somebody typed, so they are checked against known distances", () => {
  /**
   * These were written from memory to answer one question — which metros fall
   * inside RADIUS.ladderMi's last rung of each other — and invented data that
   * nothing checks is exactly the kind this repo keeps getting caught by. A
   * transposed pair or a dropped minus sign passes every other test in this
   * file and silently produces the wrong advice about where to open a metro.
   *
   * Real great-circle distances, tolerance 25mi, which is far tighter than a
   * mistake would be and far looser than the centroid choice matters.
   */
  const KNOWN: [string, string, number][] = [
    ["dallas", "houston", 225],
    ["dallas", "austin", 183],
    ["houston", "austin", 146],
    ["new-york", "philadelphia", 80],
    ["los-angeles", "san-diego", 111],
    ["san-francisco", "sacramento", 75],
    ["atlanta", "birmingham", 135],
    ["miami", "orlando", 194],
    ["seattle", "portland", 145],
    ["new-york", "los-angeles", 2451],
    ["boston", "washington", 393],
  ];

  const at = (id: string) => {
    const m = METROS.find((x) => x.id === id);
    if (!m?.lat || !m?.lng) throw new Error(`no coordinates for ${id}`);
    return m;
  };

  const miles = (a: string, b: string) => {
    const [p, q] = [at(a), at(b)];
    const R = 3958.8;
    const rad = (d: number) => (d * Math.PI) / 180;
    const h =
      Math.sin(rad(q.lat! - p.lat!) / 2) ** 2 +
      Math.cos(rad(p.lat!)) * Math.cos(rad(q.lat!)) * Math.sin(rad(q.lng! - p.lng!) / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  };

  it.each(KNOWN)("%s to %s is about %i miles", (a, b, expected) => {
    expect(Math.abs(miles(a, b) - expected)).toBeLessThan(25);
  });

  it("every metro except elsewhere has a coordinate", () => {
    // The floor. Every distance assertion above skips a metro it cannot read,
    // so a missing pair would go unnoticed by all of them.
    const without = METROS.filter((m) => m.id !== "elsewhere" && (m.lat == null || m.lng == null));
    expect(without.map((m) => m.id)).toEqual([]);
    expect(METROS.length).toBeGreaterThan(40);
  });

  it("elsewhere has none, because it is not a place", () => {
    const e = METROS.find((m) => m.id === "elsewhere");
    expect(e?.lat).toBeUndefined();
    expect(metrosWithin("elsewhere", 250).near).toEqual([]);
  });

  it("nothing sits outside the continental US, which is what a sign error looks like", () => {
    // A dropped minus on longitude lands a US city in China and still passes a
    // pairwise check between two cities that were BOTH flipped.
    for (const m of METROS) {
      if (m.lat == null || m.lng == null) continue;
      expect(m.lat, m.id).toBeGreaterThan(24);
      expect(m.lat, m.id).toBeLessThan(49);
      expect(m.lng, m.id).toBeLessThan(-66);
      expect(m.lng, m.id).toBeGreaterThan(-125);
    }
  });

  it("clusters Texas together and does not reach California", () => {
    // The finding that produced all of this: Kevin's first testers landed one
    // per metro, and Houston/Dallas were the only pair inside the last rung.
    const texas = metrosWithin("dallas", 250).near;
    expect(texas).toContain("houston");
    expect(texas).toContain("austin");
    expect(texas).not.toContain("san-francisco");
    expect(metrosWithin("san-francisco", 250).near).not.toContain("dallas");
  });

  it("names the pairs too close to the line to trust", () => {
    // Houston-Dallas is ~225 against a 250 rung, so it must be flagged: the
    // centroid error and the member's own position across a metro both exceed
    // the 25-mile margin, and reporting it as a fact would be overclaiming.
    expect(metrosWithin("dallas", 250).borderline).toContain("houston");
  });
});

describe("every metro knows what time it is", () => {
  const real = METROS.filter((m) => m.id !== "elsewhere");

  it("has a real list to walk", () => {
    // The floor. An empty list makes every assertion below vacuous, which is
    // the shape that let a labels scan read no columns and pass.
    expect(real.length).toBeGreaterThan(30);
  });

  it("gives every place a zone", () => {
    // `elsewhere` is the one exception and it is not a place. Everything else
    // has somebody in it who gets an email at a local hour.
    const missing = real.filter((m) => !m.tz).map((m) => m.id);
    expect(missing).toEqual([]);
  });

  it("uses zones the runtime actually knows", () => {
    // A typo in an IANA name does not throw on assignment — it throws at
    // format() time, inside a cron, at 7pm, for one metro. Ask the zone
    // database here instead, where it is free.
    for (const m of real) {
      expect(() => localHourIn(m.tz as string, new Date(0))).not.toThrow();
    }
    expect(() => localHourIn(WAITLIST_REMINDER_TZ, new Date(0))).not.toThrow();
  });

  it("keeps the zones that do not follow their neighbours", () => {
    // The three this list would get wrong if the zone were derived from a state
    // code or a longitude, which is why they are written out. Arizona does not
    // observe DST; Indiana spent decades not doing so; Michigan is Eastern
    // despite sitting west of Georgia.
    expect(metroTimezone("phoenix")).toBe("America/Phoenix");
    expect(metroTimezone("indianapolis")).toBe("America/Indiana/Indianapolis");
    expect(metroTimezone("detroit")).toBe("America/Detroit");
  });

  it("falls back rather than skipping somebody who said elsewhere", () => {
    expect(metroTimezone("elsewhere")).toBe(WAITLIST_REMINDER_TZ);
    expect(metroTimezone("not-a-metro")).toBe(WAITLIST_REMINDER_TZ);
  });

  it("reads the hour on a 24-hour clock", () => {
    // The en-US default is h12 and renders midnight as "24", which compares as
    // a number nobody expects and would send at the wrong hour exactly once a
    // day. 2026-01-01T05:00Z is midnight in New York.
    expect(localHourIn("America/New_York", new Date("2026-01-01T05:00:00Z"))).toBe(0);
    expect(localHourIn("America/New_York", new Date("2026-01-01T17:00:00Z"))).toBe(12);
  });

  it("follows daylight saving rather than a fixed offset", () => {
    // The reason tz holds a NAME. Same UTC instant, six months apart, and New
    // York is a different number of hours from it — which a stored offset, or
    // an offset derived from longitude, gets wrong for half the year.
    const winter = localHourIn("America/New_York", new Date("2026-01-15T17:00:00Z"));
    const summer = localHourIn("America/New_York", new Date("2026-07-15T17:00:00Z"));
    expect(winter).toBe(12);
    expect(summer).toBe(13);
    // And Phoenix does not move, which is the whole reason it has its own zone.
    expect(localHourIn("America/Phoenix", new Date("2026-01-15T17:00:00Z"))).toBe(10);
    expect(localHourIn("America/Phoenix", new Date("2026-07-15T17:00:00Z"))).toBe(10);
  });

  it("sends at an hour that exists", () => {
    expect(WAITLIST_REMINDER_HOUR).toBeGreaterThanOrEqual(0);
    expect(WAITLIST_REMINDER_HOUR).toBeLessThan(24);
  });

  it("spans more than one zone, which is why the cron cannot be fixed in UTC", () => {
    // The premise of running hourly. If every metro were in one zone, a single
    // daily schedule would do and this machinery would be waste.
    const zones = new Set(real.map((m) => m.tz));
    expect(zones.size).toBeGreaterThan(1);
  });
});

describe("the one reminder is scheduled, not dripped", () => {
  const sql = stripComments(waitlistSql());

  it("records that it was sent, in its own column", () => {
    // confirm_sent_at cannot do this job: joinWaitlist writes it too, on a
    // repeat submission of the public form, so "moved since created_at" means
    // either we reminded them or they asked again. Two facts, two columns.
    expect(sql).toMatch(/add column if not exists reminded_at timestamptz/);
  });

  it("leaves room for the reminder inside the life of the row", () => {
    expect(WAITLIST_REMINDER_AFTER_DAYS).toBeLessThan(WAITLIST_UNCONFIRMED_TTL_DAYS);
  });
});

/**
 * Three nudges about an unused invitation — Kevin, 2026-09-23.
 *
 *   1  three days after the invitation
 *   2  the 7pm nearest to seven days before it expires
 *   3  the 7pm nearest to 24 hours before it expires
 *
 * Tested by RUNNING the schedule rather than reading it: every one of the
 * cron's instants across a whole fourteen-day link, in seven zones, for
 * invitations issued at every five minutes of the day and across both clock
 * changes. The first version of this schedule passed a suite that sampled one
 * invitation time per hour, and review then found two ways it was wrong at the
 * minutes that suite never tried.
 */
describe("the invitation nudges", () => {
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const ZONES = [
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Phoenix",
    "America/Los_Angeles",
    "America/Anchorage",
    "Pacific/Honolulu",
  ];

  interface Send {
    readonly stage: number;
    readonly at: number;
  }

  /**
   * Run the cron from invitation to expiry, the way the route does: the hour
   * first, then the stage, then the stamp. `jitter` is how late into its minute
   * the route actually runs — the real one stamps 23:05:02, not 23:05:00.
   */
  function simulate(
    invitedAt: string,
    tz: string,
    {
      skip,
      predict = true,
      jitter = 0,
    }: { skip?: (at: number) => boolean; predict?: boolean; jitter?: number } = {},
  ) {
    const sends: Send[] = [];
    const predictions: { made: number; stage: number; at: number }[] = [];
    let nudgedAt: string | null = null;
    const start = Math.ceil(Date.parse(invitedAt) / HOUR) * HOUR + WAITLIST_CRON_MINUTE * MIN;
    for (let t = start; t < inviteExpiresAt(invitedAt) + DAY; t += HOUR) {
      const at = new Date(t + jitter);
      const next = predict ? nextInviteNudge(invitedAt, nudgedAt, tz, new Date(t - MIN)) : null;
      if (next) predictions.push({ made: t, stage: next.stage, at: next.at.getTime() });
      if (skip?.(t)) continue;
      if (localHourIn(tz, at) !== WAITLIST_REMINDER_HOUR) continue;
      const stage = inviteNudgeDue(invitedAt, at, tz);
      if (stage === 0 || stage <= inviteNudgeSent(invitedAt, nudgedAt, tz)) continue;
      sends.push({ stage, at: t });
      nudgedAt = at.toISOString();
    }
    return { sends, predictions };
  }

  /** Every 7pm-local cron run within two days of a target, to check "nearest" by hand. */
  function eveningsAround(target: number, tz: string): number[] {
    const out: number[] = [];
    const base = Math.floor(target / HOUR) * HOUR + WAITLIST_CRON_MINUTE * MIN;
    for (let k = -48; k <= 48; k += 1) {
      const t = base + k * HOUR;
      if (localHourIn(tz, new Date(t)) === WAITLIST_REMINDER_HOUR) out.push(t);
    }
    return out;
  }

  function checkSends(invitedAt: string, tz: string, sends: readonly Send[]) {
    const label = `${tz} invited ${invitedAt}`;
    const expires = inviteExpiresAt(invitedAt);
    expect(
      sends.map((x) => x.stage),
      label,
    ).toEqual([1, 2, 3]);
    for (const x of sends) expect(localHourIn(tz, new Date(x.at)), label).toBe(19);
    const [first, week, last] = sends as [Send, Send, Send];

    // 1: at least three days in, and the FIRST 7pm that is.
    expect(first.at - Date.parse(invitedAt), label).toBeGreaterThanOrEqual(
      WAITLIST_NUDGE_AFTER_DAYS * DAY,
    );
    expect(first.at - Date.parse(invitedAt), label).toBeLessThan(
      (WAITLIST_NUDGE_AFTER_DAYS + 1) * DAY + HOUR,
    );

    // 2 and 3: the NEAREST 7pm to their target — checked against every 7pm
    // either side, not against a window this test also has to trust.
    for (const [send, target] of [
      [week, expires - WAITLIST_NUDGE_WEEK_LEFT_DAYS * DAY],
      [last, expires - WAITLIST_NUDGE_LAST_HOURS * HOUR],
    ] as const) {
      const distance = Math.abs(send.at - target);
      for (const other of eveningsAround(target, tz)) {
        expect(distance, `${label}: a nearer 7pm existed`).toBeLessThanOrEqual(
          Math.abs(other - target),
        );
      }
    }

    // And the last never lands on top of the expiry — the review's finding.
    expect(expires - last.at, label).toBeGreaterThan(11 * HOUR);
  }

  it("sends three, in order, at 7pm local, and the fixed ones at the nearest 7pm", () => {
    let cases = 0;
    for (const tz of ZONES) {
      for (let m = 0; m < 24 * 60; m += 5) {
        const invitedAt = new Date(Date.UTC(2026, 8, 20) + m * MIN).toISOString();
        checkSends(invitedAt, tz, simulate(invitedAt, tz, { predict: false }).sends);
        cases += 1;
      }
    }
    expect(cases).toBe(ZONES.length * 288);
  }, 60_000);

  it("holds across both clock changes, for every invitation minute either side", () => {
    // 2026-03-08 springs forward and 2026-11-01 falls back in the US. The
    // first version used 24-hour windows, and on the autumn night two 7pms are
    // 25 hours apart — so a window could hold none and a nudge vanished. The
    // nearest 7pm is found by looking, so there is no window to fall between.
    for (const tz of [
      "America/New_York",
      "America/Chicago",
      "America/Los_Angeles",
      "America/Denver",
    ]) {
      for (const from of [Date.UTC(2026, 1, 20), Date.UTC(2026, 9, 15)]) {
        for (let t = from; t < from + 18 * DAY; t += 20 * MIN) {
          const invitedAt = new Date(t).toISOString();
          checkSends(invitedAt, tz, simulate(invitedAt, tz, { predict: false }).sends);
        }
      }
    }
  }, 120_000);

  it("reads a stamp taken seconds into the run as the stage that was sent", () => {
    // The route stamps the moment it ran. A schedule compared to the exact
    // minute would call 23:05:37 a different run from 23:05:00 and send twice.
    for (const tz of ZONES) {
      const invitedAt = "2026-09-20T18:49:00.000Z";
      const late = simulate(invitedAt, tz, { predict: false, jitter: 37_000 }).sends;
      const onTime = simulate(invitedAt, tz, { predict: false }).sends;
      expect(late).toEqual(onTime);
    }
  });

  it("matches what Kevin was told for the 20 September cohort", () => {
    // Invited Sunday 2026-09-20 at 18:49 UTC, so the link dies Sunday 4 October
    // at 2:49pm Eastern. Tonight, Sunday 27 September, Saturday 3 October.
    //
    // Kevin was told Saturday, Friday and Saturday respectively, all afternoon —
    // every weekday one short, worked out by hand. The dates were right and the
    // code names the day through Intl; the test below is what caught it.
    const { sends } = simulate("2026-09-20T18:49:00.000Z", "America/New_York");
    expect(sends.map((x) => new Date(x.at).toISOString())).toEqual([
      "2026-09-23T23:05:00.000Z",
      "2026-09-27T23:05:00.000Z",
      "2026-10-03T23:05:00.000Z",
    ]);
  });

  it("skips a missed nudge rather than sending it late", () => {
    const invitedAt = "2026-09-20T18:49:00.000Z";
    for (const tz of ZONES) {
      const { week, lastDay } = inviteNudgeSchedule(invitedAt, tz);
      // The week-left run is down: the first and last still go, and the
      // second does not turn up the next evening.
      const noWeek = simulate(invitedAt, tz, {
        predict: false,
        skip: (t) => Math.floor(t / HOUR) === Math.floor(week / HOUR),
      });
      expect(
        noWeek.sends.map((x) => x.stage),
        tz,
      ).toEqual([1, 3]);
      // The last-day run is down: nothing arrives after it.
      const noLast = simulate(invitedAt, tz, {
        predict: false,
        skip: (t) => Math.floor(t / HOUR) === Math.floor(lastDay / HOUR),
      });
      expect(
        noLast.sends.map((x) => x.stage),
        tz,
      ).toEqual([1, 2]);
    }
    // The first missed entirely goes straight to the week-left one.
    const { week } = inviteNudgeSchedule(invitedAt, "America/Chicago");
    const late = simulate(invitedAt, "America/Chicago", { predict: false, skip: (t) => t < week });
    expect(late.sends.map((x) => x.stage)).toEqual([2, 3]);
  });

  it("predicts the cron exactly, so the admin screen cannot describe another schedule", () => {
    for (const tz of ZONES) {
      const { sends, predictions } = simulate("2026-09-20T02:10:00.000Z", tz);
      // There ARE predictions, and every send was named in advance — a
      // nextInviteNudge that returned null would satisfy the loop below alone.
      expect(predictions.length, tz).toBeGreaterThan(24);
      for (const x of sends) {
        expect(
          predictions.some((p) => p.made <= x.at && p.stage === x.stage && p.at === x.at),
          `${tz} send ${x.stage}`,
        ).toBe(true);
      }
      for (const p of predictions) {
        const actual = sends.find((x) => x.at >= p.made);
        expect(actual, `${tz} prediction at ${new Date(p.made).toISOString()}`).toBeDefined();
        expect({ stage: p.stage, at: p.at }).toEqual({ stage: actual!.stage, at: actual!.at });
      }
      const last = sends.at(-1)!;
      expect(predictions.some((p) => p.made > last.at)).toBe(false);
    }
  });

  it("starts over for a re-issued invitation", () => {
    const oldNudge = "2026-10-03T23:05:00.000Z";
    const reissued = "2026-10-05T16:00:00.000Z";
    expect(inviteNudgeSent(reissued, oldNudge, "America/New_York")).toBe(0);
    expect(simulate(reissued, "America/New_York").sends.map((x) => x.stage)).toEqual([1, 2, 3]);
  });

  it("counts a stray send as the stage it fell in, so it cannot be followed by a duplicate", () => {
    const invitedAt = "2026-09-20T18:49:00.000Z";
    const tz = "America/New_York";
    const { week, lastDay } = inviteNudgeSchedule(invitedAt, tz);
    const at = (t: number) => new Date(t).toISOString();
    expect(inviteNudgeSent(invitedAt, at(Date.parse(invitedAt) + HOUR), tz)).toBe(1);
    expect(inviteNudgeSent(invitedAt, at(week - MIN * 10), tz)).toBe(1);
    // A run that fires a second EARLY still belongs to its hour. Compared to
    // the exact instant instead, this reads back as the first nudge, and the
    // admin screen says "1 of 3" after the second went.
    expect(inviteNudgeSent(invitedAt, at(week - 1000), tz)).toBe(2);
    expect(inviteNudgeSent(invitedAt, at(lastDay - 1000), tz)).toBe(3);
    expect(inviteNudgeSent(invitedAt, at(week + MIN * 30), tz)).toBe(2);
    expect(inviteNudgeSent(invitedAt, at(lastDay - DAY), tz)).toBe(2);
    expect(inviteNudgeSent(invitedAt, at(lastDay + MIN * 30), tz)).toBe(3);
    expect(inviteNudgeSent(invitedAt, null, tz)).toBe(0);
  });

  it("sends nothing after the link has run out", () => {
    const invitedAt = "2026-09-20T18:49:00.000Z";
    const after = new Date(inviteExpiresAt(invitedAt) + 1);
    expect(inviteNudgeDue(invitedAt, after, "America/New_York")).toBe(0);
    expect(
      nextInviteNudge(invitedAt, "2026-10-03T23:05:00.000Z", "America/New_York", after),
    ).toBeNull();
  });

  it("finds the nearest 7pm, and the earlier one on a tie", () => {
    // New York, 7:05pm EDT is 23:05 UTC. A target exactly between two of them
    // takes the earlier, so the email is never later than the promise.
    const ny = "America/New_York";
    expect(eveningNearest(Date.parse("2026-09-26T20:00:00.000Z"), ny)).toBe(
      Date.parse("2026-09-26T23:05:00.000Z"),
    );
    expect(eveningNearest(Date.parse("2026-09-27T11:05:00.000Z"), ny)).toBe(
      Date.parse("2026-09-26T23:05:00.000Z"),
    );
    expect(eveningNearest(Date.parse("2026-09-27T11:06:00.000Z"), ny)).toBe(
      Date.parse("2026-09-27T23:05:00.000Z"),
    );
  });

  it("never promises a day that does not exist", () => {
    for (let m = 0; m < 24 * 60; m += 10) {
      const invitedAt = new Date(Date.UTC(2026, 8, 20) + m * MIN).toISOString();
      const [first] = simulate(invitedAt, "America/New_York", { predict: false }).sends;
      const left = (inviteExpiresAt(invitedAt) - first!.at) / DAY;
      const promised = inviteNudgeDaysLeft(invitedAt, new Date(first!.at));
      expect(promised, invitedAt).toBeLessThanOrEqual(left);
      expect(promised, invitedAt).toBeGreaterThan(left - 1);
    }
    expect(
      inviteNudgeDaysLeft("2026-09-20T18:49:00.000Z", new Date("2026-09-23T23:05:00.000Z")),
    ).toBe(10);
  });

  it("agrees with the cron's real schedule", () => {
    const vercel = JSON.parse(
      readFileSync(
        fileURLToPath(new URL("../../../apps/web/vercel.json", import.meta.url)),
        "utf8",
      ),
    ) as { crons: { path: string; schedule: string }[] };
    const cron = vercel.crons.find((c) => c.path === "/api/cron/waitlist-reminders");
    expect(cron?.schedule).toBe(`${WAITLIST_CRON_MINUTE} * * * *`);
  });

  describe("the copy Kevin chose", () => {
    const emails = ([1, 2, 3] as const).map((stage) => WAITLIST_EMAIL[INVITE_NUDGE_EMAIL[stage]]);
    const cohort = "2026-09-20T18:49:00.000Z";

    it("is word for word what was approved", () => {
      expect(emails.map((e) => e.subject)).toEqual([
        "Your Plus One invitation is still open",
        "One week left on your Plus One invitation",
        "Last day for your Plus One invitation",
      ]);
      expect(emails.map((e) => e.body.join(" "))).toEqual([
        "You asked to try Plus One early and we sent you a link. It has not been used yet.",
        "Your invitation to the beta is still waiting. The link works for one more week.",
        "Your link stops working on {when}. This is the last reminder we will send.",
      ]);
      expect(inviteNudgeDeadline(10)).toBe("It stops working in 10 days.");
      expect(inviteNudgeDeadline(1)).toBe("It stops working in 1 day.");
    });

    it("arrives filled in, exactly", () => {
      // What the 20 September cohort actually receives, from the function the
      // cron calls.
      const ny = "America/New_York";
      expect(inviteNudgeBody(1, cohort, new Date("2026-09-23T23:05:00.000Z"), ny)).toEqual([
        "You asked to try Plus One early and we sent you a link. It has not been used yet. It stops working in 10 days.",
      ]);
      expect(inviteNudgeBody(2, cohort, new Date("2026-09-27T23:05:00.000Z"), ny)).toEqual([
        "Your invitation to the beta is still waiting. The link works for one more week.",
      ]);
      expect(inviteNudgeBody(3, cohort, new Date("2026-10-03T23:05:00.000Z"), ny)).toEqual([
        "Your link stops working on Sunday at 2:49 PM EDT. This is the last reminder we will send.",
      ]);
      // In the person's own zone, named — `elsewhere` falls back to New York.
      expect(inviteNudgeExpiry(cohort, "America/Los_Angeles")).toBe("Sunday at 11:49 AM PDT");
      expect(inviteNudgeExpiry(cohort, "America/Chicago")).toBe("Sunday at 1:49 PM CDT");
    });

    it("leaves no placeholder behind", () => {
      for (const stage of [1, 2, 3] as const) {
        const body = inviteNudgeBody(
          stage,
          cohort,
          new Date("2026-10-03T23:05:00.000Z"),
          "America/Denver",
        );
        expect(body.join(" "), `stage ${stage}`).not.toMatch(/[{}]/);
      }
    });

    it("opens with its own preview line, so nothing unapproved is printed above it", () => {
      for (const e of emails) expect(e.body.join(" ").startsWith(e.preview), e.subject).toBe(true);
    });

    it("no longer promises only one", () => {
      for (const e of emails.slice(0, 2)) {
        expect(`${e.preview} ${e.body.join(" ")}`).not.toMatch(/only reminder|last reminder/i);
      }
      expect(emails[2]!.body.join(" ")).toMatch(/last reminder/);
    });
  });
});
