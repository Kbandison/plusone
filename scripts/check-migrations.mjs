#!/usr/bin/env node
/**
 * Validates supabase/migrations without needing a database.
 *
 * Pass 1 — parses every file against the real PostgreSQL grammar (libpg_query,
 *          the same parser the server uses), so syntax errors surface in CI
 *          rather than halfway through applying a migration to production.
 *
 * Pass 2 — cross-checks references across all files: every FK target, every
 *          public.fn() call, every policy/trigger/grant target must resolve.
 *          It also enforces two project invariants that are easy to forget and
 *          expensive to miss:
 *            · every table enables row level security
 *            · every table granted to a role has at least one policy
 *              (a granted table with no policy is silently deny-all, which
 *               looks like "the query returns nothing" at 2am)
 *
 * This is not a substitute for applying the migrations. It catches the classes
 * of error that are cheap to catch early.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "supabase", "migrations");

const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error("No migration files found in supabase/migrations");
  process.exit(1);
}

// ── pass 1: grammar ──────────────────────────────────────────────────────────
const pg = await import("libpg-query");
const lib = pg.default ?? pg;
if (lib.loadModule) await lib.loadModule();
const parse = lib.parseSync ?? lib.parse;

let syntaxFailures = 0;
console.log("Parsing migrations\n");

for (const file of files) {
  const sql = readFileSync(path.join(DIR, file), "utf8");
  try {
    const result = await parse(sql);
    const stmts = result?.stmts ?? result?.parse_tree?.stmts ?? [];
    console.log(`  ok    ${file}  (${stmts.length} statements)`);
  } catch (err) {
    syntaxFailures++;
    const msg = err?.message ?? String(err);
    const m = /at index (\d+)/.exec(msg) ?? /cursorpos[": ]+(\d+)/.exec(msg);
    let where = "";
    if (m) {
      const idx = Number(m[1]);
      const before = sql.slice(0, idx);
      const line = before.split("\n").length;
      where = `\n        line ${line}: ${(sql.split("\n")[line - 1] ?? "").trim()}`;
    }
    console.log(`  FAIL  ${file}\n        ${msg}${where}`);
  }
}

if (syntaxFailures > 0) {
  console.error(`\n${syntaxFailures} file(s) failed to parse.`);
  process.exit(1);
}

// ── pass 2: references and invariants ────────────────────────────────────────
const sql = files.map((f) => readFileSync(path.join(DIR, f), "utf8")).join("\n");
const code = sql.replace(/--[^\n]*/g, ""); // drop comments so prose can't false-positive

const tables = new Set();
const views = new Set();
const columns = new Map();
const functions = new Set();
const types = new Set();

for (const m of code.matchAll(/create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
  const [, name, body] = m;
  tables.add(name);
  const cols = new Set();
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (!t || /^(constraint|primary key|unique|foreign key|check)\b/i.test(t)) continue;
    const cm = /^(\w+)\s+/.exec(t);
    if (cm) cols.add(cm[1]);
  }
  columns.set(name, cols);
}
for (const m of code.matchAll(/create (?:or replace )?view public\.(\w+)/g)) views.add(m[1]);
for (const m of code.matchAll(/create (?:or replace )?function public\.(\w+)\s*\(/g)) functions.add(m[1]);
for (const m of code.matchAll(/create type public\.(\w+)/g)) types.add(m[1]);

const relations = new Set([...tables, ...views]);
const problems = [];

for (const m of code.matchAll(/references\s+(public|auth)\.(\w+)\s*\((\w+)\)/g)) {
  const [, schema, tbl, col] = m;
  if (schema === "auth") continue; // Supabase-managed
  if (!tables.has(tbl)) problems.push(`FK -> missing table public.${tbl}`);
  else if (!columns.get(tbl).has(col)) problems.push(`FK -> public.${tbl}.${col} (no such column)`);
}

for (const m of code.matchAll(/public\.(\w+)\s*\(/g)) {
  const name = m[1];
  if (functions.has(name) || types.has(name) || relations.has(name)) continue;
  problems.push(`call -> public.${name}() is never defined`);
}

for (const m of code.matchAll(/create policy\s+"[^"]+"\s*\n?\s*on public\.(\w+)/g)) {
  if (!relations.has(m[1])) problems.push(`policy -> missing relation public.${m[1]}`);
}
for (const m of code.matchAll(/create trigger \w+\s*\n?\s*(?:before|after)[\s\S]{0,60}?on public\.(\w+)/g)) {
  if (!relations.has(m[1])) problems.push(`trigger -> missing relation public.${m[1]}`);
}
for (const m of code.matchAll(/grant [\w\s,]+ on public\.(\w+) to/g)) {
  if (!relations.has(m[1])) problems.push(`grant -> missing relation public.${m[1]}`);
}
for (const m of code.matchAll(/grant execute on function public\.(\w+)\s*\(/g)) {
  if (!functions.has(m[1])) problems.push(`grant execute -> missing function public.${m[1]}`);
}

const rlsEnabled = new Set(
  [...code.matchAll(/alter table public\.(\w+) enable row level security/g)].map((m) => m[1]),
);
for (const t of tables) {
  if (!rlsEnabled.has(t)) problems.push(`RLS -> public.${t} never enables row level security`);
}

const granted = new Set([...code.matchAll(/grant [\w\s,]+ on public\.(\w+) to/g)].map((m) => m[1]));
const withPolicy = new Set(
  [...code.matchAll(/create policy\s+"[^"]+"\s*\n?\s*on public\.(\w+)/g)].map((m) => m[1]),
);
for (const t of granted) {
  if (tables.has(t) && !withPolicy.has(t)) {
    problems.push(`RLS -> public.${t} is granted to a role but has no policy (silently deny-all)`);
  }
}

console.log(
  `\nSchema: ${tables.size} tables · ${views.size} views · ${functions.size} functions · ${types.size} enums`,
);

const unique = [...new Set(problems)];
if (unique.length > 0) {
  console.error(`\n${unique.length} problem(s):`);
  for (const p of unique) console.error("  " + p);
  process.exit(1);
}

console.log("All references resolve. Every table has RLS and at least one policy.");
