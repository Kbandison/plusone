import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BANNED_COPY_TERMS, BANNED_PRIVACY_CLAIMS } from "./brand";
import { COPY } from "./copy";
import { DRAFT_COPY } from "./draft-copy";
import { HINTS, HINT_IDS, HINTS_STORAGE_KEY } from "./hints";

const APP = new URL("../../../apps/web/src/app/", import.meta.url);

function tsx(dir: URL, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
    if (entry.isDirectory()) tsx(child, acc);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      acc.push(readFileSync(fileURLToPath(child), "utf8"));
    }
  }
  return acc;
}

const sources = tsx(APP);
const corpus = sources.join("\n");

describe("every hint is placed, and every placement is a hint", () => {
  it("finds the app source at all", () => {
    // A silent zero makes both assertions below vacuous.
    expect(sources.length).toBeGreaterThan(40);
  });

  it("renders each one somewhere", () => {
    // A hint nobody placed is a paragraph in a config file.
    for (const id of HINT_IDS) {
      expect(corpus, `${id} is defined and never rendered`).toContain(`id="${id}"`);
    }
  });

  it("renders no id that is not defined", () => {
    // The other direction: a typo in a placement renders nothing at all, in
    // silence, because Hint returns null for an unknown id.
    const placed = [...corpus.matchAll(/<Hint\s+id="([^"]+)"/g)].map((m) => m[1] as string);
    expect(placed.length).toBeGreaterThan(0);
    for (const id of placed) {
      expect(HINT_IDS, `<Hint id="${id}"> matches no entry in HINTS`).toContain(id);
    }
  });

  it("places each one once", () => {
    // The same note on two screens is the beginning of two answers to one
    // question — and both would have to be dismissed separately.
    const placed = [...corpus.matchAll(/<Hint\s+id="([^"]+)"/g)].map((m) => m[1] as string);
    expect(placed.length).toBe(new Set(placed).size);
  });
});

describe("a hint teaches something no screen already says", () => {
  /**
   * The rule that keeps this list short. Most of what a new member needs is
   * already on the screen and was written carefully — `dropConnectsFree`,
   * `chatEmptyBody`, `browseEmpty`. A hint repeating one of those is noise, and
   * worse, a second copy of a sentence that will drift from the first.
   */
  const existing = [
    ...Object.values(COPY.marketing),
    ...Object.values(COPY.drop),
    DRAFT_COPY.app.chatEmptyBody,
    DRAFT_COPY.app.roomEmptyBody,
    DRAFT_COPY.app.browseEmpty,
    DRAFT_COPY.app.dropConnectsFree,
  ]
    // `.filter((v): v is string => …)` fails here: COPY's values are literal
    // types, so the predicate is wider than what it narrows. Filtering by
    // typeof and mapping to string gets the same result without the claim.
    .filter((v) => typeof v === "string")
    .map((v) => String(v).toLowerCase());

  it("duplicates no existing sentence", () => {
    for (const hint of HINTS) {
      const body = hint.body.toLowerCase();
      for (const sentence of existing) {
        expect(body, `"${hint.id}" repeats copy that is already on a screen`).not.toContain(
          sentence,
        );
      }
    }
  });

  it("says what it prevents, which is its reason to exist", () => {
    for (const hint of HINTS) {
      // Not shown to anybody. It is the thing that has to be true for the entry
      // to belong here at all, and writing it down is what stops the list
      // growing into a tour.
      expect(hint.prevents.length, `${hint.id} has no stated reason`).toBeGreaterThan(60);
    }
  });
});

describe("hint copy holds to the same rules as everything else", () => {
  it("uses no banned term", () => {
    for (const hint of HINTS) {
      const all = `${hint.heading} ${hint.body}`.toLowerCase();
      for (const term of BANNED_COPY_TERMS) {
        expect(all, `${hint.id} uses "${term}"`).not.toContain(term.toLowerCase());
      }
      for (const claim of BANNED_PRIVACY_CLAIMS) {
        expect(all, `${hint.id} claims "${claim}"`).not.toContain(claim.toLowerCase());
      }
    }
  });

  it("stays short enough to be read rather than skipped", () => {
    for (const hint of HINTS) {
      expect(hint.heading.length, `${hint.id} heading`).toBeLessThanOrEqual(40);
      expect(hint.body.length, `${hint.id} body`).toBeLessThanOrEqual(240);
    }
  });

  it("has unique, stable ids", () => {
    expect(new Set(HINT_IDS).size).toBe(HINTS.length);
    for (const id of HINT_IDS) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });
});

describe("nothing about hints reaches the database", () => {
  it("is stored under one local key", () => {
    expect(HINTS_STORAGE_KEY).toMatch(/^plusone\./);
  });

  it("no migration mentions them", () => {
    // Which tips somebody dismissed is behavioural data about how a particular
    // person uses an HSV and HIV app. Server-side it would live in a table, in
    // every backup, and in any subject access request — for the sake of not
    // showing a four-line note twice.
    const MIGRATIONS = new URL("../../../supabase/migrations/", import.meta.url);
    const dir = fileURLToPath(MIGRATIONS);
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(fileURLToPath(new URL(f, MIGRATIONS)), "utf8"))
      .join("\n");
    expect(sql.length).toBeGreaterThan(10_000);
    expect(sql).not.toMatch(/\bseen_hints\b|\bhints_dismissed\b|\bmember_hints\b/);
  });
});
