import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { COPY } from "./copy";
import {
  DRAFT_COPY,
  PROFILE_PROMPTS,
  promptQuestion,
  CONDITIONS_BY_COMMUNITY,
  CONDITION_LABELS,
  COMMUNITY_LABELS,
  allowsUEqualsU,
  isValidPair,
} from "./draft-copy";

const MIGRATIONS = new URL("../../../supabase/migrations/", import.meta.url);
const read = (name: string) => readFileSync(fileURLToPath(new URL(name, MIGRATIONS)), "utf8");

describe("the community/condition mapping matches the database", () => {
  const enums = read("20260813000100_extensions_and_enums.sql");
  const tables = read("20260813000200_tables.sql");

  // A mismatch here does not fail loudly. It offers a member a choice the
  // database then refuses, at the end of a form they already filled in.
  it("covers exactly the condition_detail enum, with no extras", () => {
    const block =
      /create type public\.condition_detail as enum \(([\s\S]*?)\);/.exec(enums)?.[1] ?? "";
    const fromSql = [...block.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
    const fromTs = Object.values(CONDITIONS_BY_COMMUNITY).flat().sort();
    expect(fromTs).toEqual(fromSql);
    expect(Object.keys(CONDITION_LABELS).sort()).toEqual(fromSql);
  });

  it("covers exactly the condition_community enum", () => {
    const block =
      /create type public\.condition_community as enum \(([\s\S]*?)\);/.exec(enums)?.[1] ?? "";
    const fromSql = [...block.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
    expect(Object.keys(CONDITIONS_BY_COMMUNITY).sort()).toEqual(fromSql);
    expect(Object.keys(COMMUNITY_LABELS).sort()).toEqual(fromSql);
  });

  it("groups each condition exactly as the CHECK constraint does", () => {
    const check =
      /constraint profiles_condition_matches_community check \(([\s\S]*?)\n  \)/.exec(
        tables,
      )?.[1] ?? "";
    expect(check.length).toBeGreaterThan(0);
    for (const [community, conditions] of Object.entries(CONDITIONS_BY_COMMUNITY)) {
      const clause = new RegExp(`community = '${community}' and condition in \\(([^)]*)\\)`).exec(
        check,
      )?.[1];
      expect(clause, `no clause for ${community}`).toBeDefined();
      const fromSql = [...(clause ?? "").matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
      expect(fromSql).toEqual([...conditions].sort());
    }
  });

  it("puts every condition in exactly one community", () => {
    const all = Object.values(CONDITIONS_BY_COMMUNITY).flat();
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("pair validation", () => {
  it("accepts every pair the database accepts", () => {
    for (const [community, conditions] of Object.entries(CONDITIONS_BY_COMMUNITY)) {
      for (const condition of conditions) {
        expect(isValidPair(community as never, condition as never)).toBe(true);
      }
    }
  });

  it("rejects a condition from the other community", () => {
    expect(isValidPair("hsv", "hiv")).toBe(false);
    expect(isValidPair("hiv", "hsv2")).toBe(false);
  });
});

// §5.2 — u_equals_u is only meaningful for hiv, and the SQL enforces it.
describe("the U=U badge", () => {
  it("is offered only to the HIV community", () => {
    expect(allowsUEqualsU("hiv")).toBe(true);
    expect(allowsUEqualsU("hsv")).toBe(false);
  });

  it("agrees with the profiles_ueu_hiv_only constraint", () => {
    const tables = read("20260813000200_tables.sql");
    expect(tables).toContain("constraint profiles_ueu_hiv_only");
    expect(tables).toMatch(/u_equals_u = false or community = 'hiv'/);
  });
});

describe("drafts never shadow approved copy", () => {
  /** Every string value in an object tree, flattened. */
  function strings(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === "object") return Object.values(value).flatMap(strings);
    return [];
  }

  // §12: copy from §3 and §9 is used verbatim and never invented. A draft that
  // happens to say the same thing as an approved string is the beginning of two
  // sources of truth — and the approved one is the one that must win.
  it("has no draft string identical to a spec string", () => {
    const approved = new Set(strings(COPY));
    const duplicated = strings(DRAFT_COPY).filter((s) => approved.has(s));
    expect(duplicated, `drafts duplicating approved copy: ${duplicated.join(" | ")}`).toEqual([]);
  });

  /** Words only — case, punctuation and spacing removed. */
  const shape = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter(Boolean);

  /** How many words two strings share, as a fraction of the longer one. */
  function similarity(a: string, b: string): number {
    const [x, y] = [shape(a), shape(b)];
    if (x.length === 0 || y.length === 0) return 0;
    const pool = [...y];
    let shared = 0;
    for (const word of x) {
      const at = pool.indexOf(word);
      if (at !== -1) {
        shared += 1;
        pool.splice(at, 1);
      }
    }
    return shared / Math.max(x.length, y.length);
  }

  // The identical-string check missed a draft that differed from §3.4's
  // verification pitch by one word — "Every profile is" against "Every profile
  // here is". That is worse than an exact copy, because it reads as approved
  // and is not, and nothing would ever have flagged it.
  it("has no draft string that is nearly a spec string", () => {
    const approved = strings(COPY).filter((s) => shape(s).length >= 5);
    const near: string[] = [];

    for (const draft of strings(DRAFT_COPY)) {
      if (shape(draft).length < 5) continue;
      for (const spec of approved) {
        const score = similarity(draft, spec);
        if (score >= 0.8) near.push(`${(score * 100).toFixed(0)}%: "${draft}" vs "${spec}"`);
      }
    }

    expect(near, `drafts nearly duplicating approved copy:\n  ${near.join("\n  ")}`).toEqual([]);
  });
});

// Decision #14 — a connect is a reply to a prompt. Without prompts nobody can
// send one, which makes these the one set of draft strings the product cannot
// run without.
describe("profile prompts", () => {
  it("has enough to choose from without being a chore", () => {
    expect(PROFILE_PROMPTS.length).toBeGreaterThanOrEqual(6);
    expect(PROFILE_PROMPTS.length).toBeLessThanOrEqual(12);
  });

  it("gives every prompt a unique id", () => {
    const ids = PROFILE_PROMPTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves a question from an id, and nothing from a bad one", () => {
    expect(promptQuestion(PROFILE_PROMPTS[0]!.id)).toBe(PROFILE_PROMPTS[0]!.question);
    expect(promptQuestion("not-a-prompt")).toBeNull();
  });
});
