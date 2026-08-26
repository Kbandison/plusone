import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  NOT_COLLECTED,
  PRIVACY_LABELS,
  PROFILE_COLUMN_CLASSIFICATION,
  TABLE_CLASSIFICATION,
  TRACKING,
} from "./privacy-labels";

/**
 * The privacy labels, kept true as the app grows.
 *
 * A label is a public legal statement re-affirmed at every submission, months
 * apart. Nothing else in this repository would notice it going stale, because
 * the way it goes stale is not a bug — it is a feature landing and nobody
 * thinking to revisit a form on Apple's website.
 *
 * So the checks below are deliberately obstructive. Add a table or a profile
 * column and this suite goes red until somebody says which declaration it
 * belongs to. That interruption IS the mechanism.
 */
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

const migrations = readdirSync(`${ROOT}supabase/migrations`)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(`${ROOT}supabase/migrations/${f}`, "utf8"))
  .join("\n");

describe("every table is classified", () => {
  const tables = [
    ...new Set(
      [...migrations.matchAll(/create table (?:if not exists )?public\.([a-z_]+)/g)].map(
        (m) => m[1] as string,
      ),
    ),
  ].sort();

  it("finds the schema", () => {
    expect(tables.length).toBeGreaterThan(20);
  });

  /**
   * The obstructive one. A new table is a new place member data can live, and
   * the moment to decide what it is is the moment it is created — not the next
   * time somebody opens App Store Connect.
   */
  it.each(tables)("classifies public.%s", (table) => {
    expect(
      Object.prototype.hasOwnProperty.call(TABLE_CLASSIFICATION, table),
      `public.${table} is not in TABLE_CLASSIFICATION. Decide which privacy label it feeds — ` +
        `an empty \`feeds\` with a note saying why is a valid answer.`,
    ).toBe(true);
  });

  /** A classification with no reasoning is a box ticked, not a decision made. */
  it.each(Object.entries(TABLE_CLASSIFICATION))("says why for %s", (_table, entry) => {
    expect(entry.note.length).toBeGreaterThan(10);
  });

  /** Nothing may claim to feed a label that is not declared. */
  it("never points at an undeclared category", () => {
    const declared = new Set(PRIVACY_LABELS.map((l) => l.category));
    for (const [table, entry] of Object.entries(TABLE_CLASSIFICATION)) {
      for (const category of entry.feeds) {
        expect(declared.has(category), `${table} feeds "${category}", which is not declared`).toBe(
          true,
        );
      }
    }
  });
});

describe("every profiles column is classified", () => {
  const block = /create table public\.profiles \(([\s\S]*?)\n\);/.exec(migrations)?.[1] ?? "";
  /**
   * Matched on the TYPE rather than on "a word at the start of a line". The
   * looser form scooped up `or` from the second line of a multi-line CHECK
   * constraint and demanded a privacy classification for it.
   */
  const columns = block
    .split("\n")
    .map((line) => line.trim())
    .map(
      (line) =>
        /^([a-z_]+)\s+(?:uuid|text|date|boolean|integer|timestamptz|jsonb|real|extensions\.|public\.)/.exec(
          line,
        )?.[1],
    )
    .filter((name): name is string => Boolean(name));

  it("finds the columns", () => {
    expect(columns.length).toBeGreaterThan(15);
  });

  it.each(columns)("classifies profiles.%s", (column) => {
    expect(
      Object.prototype.hasOwnProperty.call(PROFILE_COLUMN_CLASSIFICATION, column),
      `profiles.${column} is unclassified. If it is not one of Apple's data types, ` +
        `mark it "operational" — but look first.`,
    ).toBe(true);
  });
});

describe("the answers that a later change could quietly reverse", () => {
  /**
   * Coarse location is a property of the schema, not a promise in a document.
   * If the rounding ever leaves that trigger, the label becomes false the same
   * day and the policy's "we never store your exact location" goes with it.
   */
  it("still rounds location before it is stored", () => {
    expect(migrations).toMatch(/create or replace function public\.round_location/);
    expect(migrations).toMatch(/round\(extensions\.ST_X\([^)]*\)::numeric, 2\)/);
    expect(migrations).toMatch(/round\(extensions\.ST_Y\([^)]*\)::numeric, 2\)/);
    expect(migrations).toMatch(/new\.location = public\.round_location\(new\.location\)/);
  });

  /**
   * "Not used for tracking" is the answer that decides whether the app needs an
   * ATT prompt. One analytics dependency reverses it.
   */
  it("has no analytics or advertising dependency", () => {
    const pkg = readFileSync(`${ROOT}apps/web/package.json`, "utf8");
    for (const forbidden of [
      "@vercel/analytics",
      "posthog",
      "mixpanel",
      "amplitude",
      "segment",
      "gtag",
      "firebase/analytics",
      "@sentry",
    ]) {
      expect(pkg.includes(forbidden), `${forbidden} would make TRACKING.used false a lie`).toBe(
        false,
      );
    }
    expect(TRACKING.used).toBe(false);
  });

  /**
   * The biometric answer. Setting OutputConfig, or raising AuditImagesLimit,
   * would start retaining members' faces at AWS — and would turn the one
   * undeclared sensitive category into a false statement.
   */
  it("still keeps nothing from the liveness check", () => {
    const liveness = readFileSync(`${ROOT}apps/web/src/lib/liveness-aws.ts`, "utf8");
    expect(liveness).not.toMatch(/OutputConfig:/);
    expect(liveness).not.toMatch(/AuditImagesLimit:\s*[1-9]/);
    expect(NOT_COLLECTED.some((n) => n.category.includes("biometric"))).toBe(true);
  });

  /**
   * Apple reads the published policy alongside the labels, and the two
   * disagreeing is worse than either being wrong alone.
   */
  it("agrees with what the policy tells members", () => {
    const legal = readFileSync(`${ROOT}packages/config/src/legal.ts`, "utf8");
    expect(legal).toMatch(/verification selfie, once the check has finished/);
    expect(legal).toMatch(/Advertising or tracking identifiers/);
    expect(legal).toMatch(/Your exact location\./);
  });

  /** Every declaration has to say what makes it true. */
  it.each(PRIVACY_LABELS)("justifies $category", (label) => {
    expect(label.justifiedBy.length).toBeGreaterThan(0);
    expect(label.what.length).toBeGreaterThan(10);
  });
});
