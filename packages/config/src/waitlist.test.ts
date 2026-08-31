import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BANNED_COPY_TERMS } from "./brand";
import { DRAFT_COPY } from "./draft-copy";
import {
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
