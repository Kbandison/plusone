import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BETA_CHECKLIST,
  BETA_CHECK_IDS,
  BETA_THANKS_MONTHS,
  BETA_WELCOME,
  HINTS,
  MUTABLE_EVENTS,
  NOTIFICATIONS,
} from "@plusone/config";

const SRC = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

/** Comments out, so no guard here is satisfied by prose describing it. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const welcome = code("app/app/beta-welcome.tsx");
const checklist = code("app/app/beta/checklist.tsx");
const page = code("app/app/beta/page.tsx");
const layout = code("app/app/layout.tsx");
const actions = code("app/admin/members/actions.ts");
const flags = code("app/app/local-flags.tsx");

describe("the beta welcome", () => {
  it("finds the files at all", () => {
    // The floor. Stripping comments from a file that is mostly comments can
    // leave very little, and every assertion below is vacuous against "".
    expect(welcome).toMatch(/BETA_WELCOME/);
    expect(checklist).toMatch(/BETA_CHECKLIST/);
    expect(flags.length).toBeGreaterThan(400);
  });

  it("is shown only to somebody who arrived during the beta", () => {
    // A member who joined afterwards would be thanked for testing and handed a
    // list of chores written for somebody else.
    expect(layout).toMatch(/me\?\.joined_in_beta \? <BetaWelcome \/> : null/);
    expect(page).toMatch(/if \(!me\?\.joined_in_beta\) redirect\("\/app"\)/);
  });

  it("renders nothing until it has read the device", () => {
    // Opening first and checking storage afterwards flashes a welcome at
    // somebody who dismissed it last week — which, in an app they were asked to
    // find bugs in, reads as one.
    expect(welcome).toMatch(/if \(flags === null \|\| has\("seen"\)\) return null/);
  });

  it("remembers dismissal on the way out, not on the button", () => {
    // Escape and the backdrop are ways out too. Remembering on the button alone
    // means two of the three ways to close it show the dialog again next time.
    expect(welcome).toMatch(/onDismiss=\{\(\) => add\("seen"\)\}/);
  });

  it("carries no list of mechanics of its own", () => {
    // Kevin asked for the four named here AND kept as hints in context, which
    // is two copies of one sentence — and hints.ts says a second copy drifts.
    // So this reads HINTS, and adding a hint grows the welcome by a line.
    expect(welcome).toMatch(/HINTS\.map/);
    expect(welcome).toMatch(/hint\.oneLine/);
    for (const hint of HINTS) expect(welcome).not.toContain(hint.oneLine);
  });

  it("gives every hint a one-line form", () => {
    // Otherwise a hint added later is silently missing from the welcome.
    for (const hint of HINTS) {
      expect(hint.oneLine.length, hint.id).toBeGreaterThan(20);
      // Not a copy of either of the other two fields. A one-liner that is the
      // heading again says nothing, and one that is the body is the tour.
      expect(hint.oneLine, hint.id).not.toBe(hint.heading);
      expect(hint.oneLine, hint.id).not.toBe(hint.body);
    }
  });
});

describe("the premium promise is one the app can keep", () => {
  it("says when it starts rather than that they have it", () => {
    // THE COLLISION. The grant is a button pressed per metro, when that area is
    // worth being in — so a tester on day one has the beta mark and NO premium,
    // possibly for months. "You qualify for three months free" sends them to
    // Settings to find they are not premium, which reads as broken.
    const said = `${BETA_WELCOME.premium.heading} ${BETA_WELCOME.premium.body}`;
    expect(said).toMatch(/opens in your area/i);
    expect(said).toMatch(/not today/i);
    expect(BETA_WELCOME.premium.heading).toContain(String(BETA_THANKS_MONTHS));
  });

  it("tells them the day it lands", () => {
    // A promise with no delivery mechanism is worse than no promise: the
    // opening is an admin pressing a button, on a day the member has no reason
    // to be looking at Settings.
    expect(actions).toMatch(/notify\("beta_thanks_started", granted\)/);
    expect(NOTIFICATIONS.beta_thanks_started.path).toBe("/app/settings/premium");
  });

  it("notifies only who the grant actually reached", () => {
    // The function skips anybody who has ever held one, so a second press
    // returns nobody — which means the double-notify is prevented by the same
    // `not exists` that prevents the double grant, rather than by a check here.
    expect(actions).toMatch(/granted\.length > 0/);
    expect(actions).toMatch(/\(data \?\? \[\]\) as \{ user_id: string \}\[\]/);
  });

  it("names nobody, like every other notification", () => {
    // §8. An admin's lock screen and a member's are both lock screens.
    const body = NOTIFICATIONS.beta_thanks_started.body;
    expect(body).not.toMatch(/HSV|HIV|herpes|diagnos/i);
    expect(body).not.toMatch(/\d/);
  });

  it("can be turned off", () => {
    // It fires once ever, so a switch can only lose somebody a message they
    // wanted — which argues for withholding it, and the argument the two
    // unswitchable events rest on is stronger and does not apply: silencing
    // verification_decided strands a member, and beta_signup never reaches one.
    // Somebody who turned everything off should not get a surprise push.
    expect(MUTABLE_EVENTS).toContain("beta_thanks_started");
  });
});

describe("the checklist is the tester's own", () => {
  it("never reaches the database", () => {
    // Which parts of an HSV and HIV app a named person used is behavioural
    // data: server-side it would sit in a table, in every backup, and in any
    // subject access request. The bug comes back through /app/feedback instead.
    expect(checklist).not.toMatch(/supabase|rpc\(|fetch\(|"use server"/);
    expect(page).not.toMatch(/beta_check|checklist_progress/);
  });

  it("says so on the screen", () => {
    // The floor under the test above, and the part a tester can act on: a list
    // that looks like it is being watched changes what somebody ticks.
    expect(read("app/app/beta/page.tsx")).toMatch(/kept on this device only/);
  });

  it("sends somebody to each row rather than naming it", () => {
    // A checklist that does not say where is a quiz.
    for (const c of BETA_CHECKLIST) expect(c.href, c.id).toMatch(/^\/app/);
  });

  it("says why each row is worth doing", () => {
    // "Send a connect" with no reason is a chore. Half of these exist because a
    // session cannot check them — three engines and another person involved.
    for (const c of BETA_CHECKLIST) expect(c.why.length, c.id).toBeGreaterThan(40);
  });

  it("has ids that are unique, because they are the storage key", () => {
    expect(new Set(BETA_CHECK_IDS).size).toBe(BETA_CHECK_IDS.length);
  });

  it("counts nothing until it has read the device", () => {
    // Rendering 0 and then jumping reads, on a checklist, as ticks being lost.
    expect(checklist).toMatch(/flags === null \? null :/);
  });
});

describe("the device store has the two properties that break silently", () => {
  it("snapshots the RAW string", () => {
    // useSyncExternalStore compares snapshots by identity, so returning a
    // parsed array builds a new one every call, which never equals the last,
    // which re-renders, which reads again. An infinite loop.
    expect(flags).toMatch(/useSyncExternalStore\(subscribe, \(\) => read\(key\), serverSnapshot\)/);
  });

  it("keeps its own listeners", () => {
    // The `storage` event fires in OTHER tabs and never in the one that wrote,
    // so without this a member ticks a box and watches nothing happen.
    expect(flags).toMatch(/const listeners = new Set/);
    expect(flags).toMatch(/for \(const listener of listeners\) listener\(\)/);
  });

  it("treats unreadable storage as empty", () => {
    // Private browsing, a full quota, a hand-edited value. The failure is
    // seeing something twice rather than losing it, which is the right way up.
    expect(flags).toMatch(/catch \{/);
    expect(flags).toMatch(/return "";/);
  });
});
